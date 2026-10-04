// Dumps the whole database to a restorable .sql file.
//
//   npm run db:backup
//
// Writes backups/ericahlicious-YYYY-MM-DD-HHmm.sql and prints a row count per
// table. See docs/03-database-operations.md for the restore procedure.
//
// Why this exists rather than a `mysqldump` call: mysqldump is not installed on
// the development machine, and the database is live client data on a shared Aiven
// instance with no automatic backups. This needs nothing beyond what `npm install`
// already provides — `mariadb` ships as a dependency of @prisma/adapter-mariadb.
//
// The connection settings mirror src/lib/db-adapter.ts. Aiven serves TLS from its
// own private CA, so verification is relaxed, and the driver's 1s default connect
// timeout is far too short for a remote host. Keep the two files in step.

import "dotenv/config";
import mariadb from "mariadb";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");

/** Rows per INSERT statement. Large enough to keep the file compact, small
 *  enough to stay well under max_allowed_packet on restore. */
const ROWS_PER_INSERT = 200;

/** Rows read per SELECT, so a big table never lands in memory all at once. */
const PAGE_SIZE = 1000;

function connectionConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set. Is .env present?");

  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000,
    // Dates and big integers come back as strings, so they can be written
    // straight into the dump without a lossy round trip through JS numbers.
    dateStrings: true,
    bigIntAsNumber: false,
  };
}

/** MySQL string literal escaping. Backslash first, or the rest double-escape. */
function quote(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/\0/g, "\\0")
    .replace(/\x08/g, "\\b")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\x1a/g, "\\Z")
    .replace(/'/g, "\\'");
  return `'${escaped}'`;
}

/** One column value as SQL. */
function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Buffer.isBuffer(value)) return `0x${value.toString("hex")}`;
  if (value instanceof Date) return quote(value.toISOString().slice(0, 23).replace("T", " "));
  // JSON columns arrive either already parsed or as text, depending on the
  // column type. Either way they are written back as a string literal.
  if (typeof value === "object") return quote(JSON.stringify(value));
  return quote(String(value));
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

async function main() {
  const config = connectionConfig();
  const conn = await mariadb.createConnection(config);

  try {
    // The Aiven server runs in ANSI mode, which includes ANSI_QUOTES — so
    // SHOW CREATE TABLE would quote identifiers with "double quotes" and the
    // dump would only restore on a server in the same mode. Drop it for this
    // session so the DDL comes out backtick-quoted and portable. Session-only:
    // nothing outside this script is affected.
    await conn.query("SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO'");

    const tableRows = (await conn.query({
      sql: "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
      rowsAsArray: true,
    })) as unknown[][];
    const tables = tableRows.map((row) => String(row[0])).sort();

    if (tables.length === 0) throw new Error(`No tables found in ${config.database}.`);

    const now = new Date();
    const parts: string[] = [
      `-- Ericahlicious database backup`,
      `-- Database: ${config.database} on ${config.host}`,
      `-- Taken:    ${now.toISOString()}`,
      `-- Restore:  see docs/03-database-operations.md`,
      ``,
      `/*!40101 SET NAMES utf8mb4 */;`,
      `SET FOREIGN_KEY_CHECKS = 0;`,
      `SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';`,
      ``,
    ];

    const counts: { table: string; rows: number }[] = [];

    for (const table of tables) {
      const created = (await conn.query(`SHOW CREATE TABLE \`${table}\``)) as Record<
        string,
        string
      >[];
      const ddl = created[0]["Create Table"];

      parts.push(
        `--`,
        `-- ${table}`,
        `--`,
        `DROP TABLE IF EXISTS \`${table}\`;`,
        `${ddl};`,
        ``
      );

      let offset = 0;
      let total = 0;
      let columns: string[] = [];
      let buffer: string[] = [];

      const flush = () => {
        if (buffer.length === 0) return;
        const cols = columns.map((c) => `\`${c}\``).join(", ");
        parts.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
        parts.push(`${buffer.join(",\n")};`);
        buffer = [];
      };

      for (;;) {
        const page = (await conn.query(
          `SELECT * FROM \`${table}\` LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        )) as Record<string, unknown>[];

        if (page.length === 0) break;
        if (columns.length === 0) columns = Object.keys(page[0]);

        for (const row of page) {
          buffer.push(`(${columns.map((c) => sqlValue(row[c])).join(", ")})`);
          if (buffer.length >= ROWS_PER_INSERT) flush();
        }

        total += page.length;
        offset += PAGE_SIZE;
        if (page.length < PAGE_SIZE) break;
      }

      flush();
      if (total > 0) parts.push(``);
      counts.push({ table, rows: total });
    }

    parts.push(`SET FOREIGN_KEY_CHECKS = 1;`, ``);

    await mkdir(OUT_DIR, { recursive: true });
    const file = join(OUT_DIR, `ericahlicious-${stamp(now)}.sql`);
    const sql = parts.join("\n");
    await writeFile(file, sql, "utf8");

    const width = Math.max(...counts.map((c) => c.table.length));
    console.log(`\nBacked up ${counts.length} tables from ${config.database}:\n`);
    for (const { table, rows } of counts) {
      console.log(`  ${table.padEnd(width)}  ${String(rows).padStart(7)} rows`);
    }
    const totalRows = counts.reduce((sum, c) => sum + c.rows, 0);
    console.log(`  ${"".padEnd(width)}  ${String(totalRows).padStart(7)} total\n`);
    console.log(`Written to ${file}`);
    console.log(`  ${(sql.length / 1024 / 1024).toFixed(2)} MB\n`);
    console.log(
      "This file holds password hashes and real business data. It is gitignored —\n" +
        "copy it to Drive or a USB stick. A backup that only exists here is not one.\n"
    );
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("\nBackup failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
