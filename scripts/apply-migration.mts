// Applies a hand-written migration file to the live database, statement by
// statement:
//
//   npx tsx scripts/apply-migration.mts <migration_folder_name>
//
// e.g. npx tsx scripts/apply-migration.mts 20260913150000_inventory_station_and_variation_recipes
//
// docs/03-database-operations.md blesses three ways to run migration SQL; the
// mysql MCP server cannot parse every statement (JSON_TABLE defeats it), so
// this is option 3 from the restore section: the mariadb driver executing the
// file one statement at a time. Connects exactly like db-backup.mts — keep the
// two connection configs in step.
//
// This does NOT record the migration. After it prints OK, run:
//
//   npx prisma migrate resolve --applied <migration_folder_name>
//
// DDL statements auto-commit in MySQL, so a mid-file failure can leave the
// schema half-migrated. Each statement is printed before it runs, together with
// its number, so the remaining statements can be run manually from the file.
// Pass --from N to start at statement N (1-based) after such a failure:
//
//   npx tsx scripts/apply-migration.mts <name> --from 4

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mariadb from "mariadb";

const name = process.argv[2];
if (!name) {
  console.error("Usage: npx tsx scripts/apply-migration.mts <migration_folder_name> [--from N]");
  process.exit(1);
}

const fromFlag = process.argv.indexOf("--from");
const from = fromFlag !== -1 ? Number(process.argv[fromFlag + 1]) : 1;
if (!Number.isInteger(from) || from < 1) {
  console.error("--from must be a statement number starting at 1");
  process.exit(1);
}

const file = join(import.meta.dirname, "..", "prisma", "migrations", name, "migration.sql");

// Statements are separated by a semicolon at end of line. The migration files
// hold no stored procedures or triggers, so no semicolon-aware tokenizer is
// needed; leading `--` comment lines go to the server as-is and are ignored.
const statements = readFileSync(file, "utf8")
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

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
  };
}

const conn = await mariadb.createConnection(connectionConfig());
try {
  if (from > 1) console.log(`Resuming from statement ${from}.`);
  for (const [i, statement] of statements.entries()) {
    const n = i + 1;
    if (n < from) continue;
    const firstLine = statement
      .split(/\r?\n/)
      .find((l) => l.trim() && !l.trim().startsWith("--"));
    console.log(`[${n}/${statements.length}] ${(firstLine ?? "").slice(0, 90)}`);
    const affected = await conn.query(statement);
    if (typeof affected?.affectedRows === "number" && affected.affectedRows > 0) {
      console.log(`           ${affected.affectedRows} row(s) affected`);
    }
  }
  console.log(`OK — statements ${from}–${statements.length} applied from ${name}.`);
  console.log(`Next: npx prisma migrate resolve --applied ${name}`);
} finally {
  await conn.end();
}
