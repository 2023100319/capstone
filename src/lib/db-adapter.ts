import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * Prisma 7 requires a driver adapter. Aiven serves TLS from its own private CA,
 * so certificate verification is relaxed rather than pinned to a bundled cert.
 * The driver's 1s default connect timeout is far too short for a remote host.
 *
 * The pool is deliberately small: on Vercel every serverless instance opens its
 * own pool, and this Aiven plan caps out at 76 connections. Two per instance is
 * plenty for one store and leaves room for many instances.
 */
export function createAdapter() {
  const url = new URL(process.env.DATABASE_URL!);
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
    connectTimeout: 20000,
    acquireTimeout: 20000,
    connectionLimit: 2,
  });
}
