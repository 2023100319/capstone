import { PrismaClient } from "@prisma/client";
import { createAdapter } from "./db-adapter";

const prismaClientSingleton = () =>
  new PrismaClient({
    adapter: createAdapter(),
    // The database is Aiven-hosted, so every statement costs a real network
    // round trip. Prisma's 5s default expires mid-transaction on an ordinary
    // multi-item payment — which deducts one row per ingredient — and leaves
    // the writes half-applied. Matches the adapter's 20s connectTimeout.
    transactionOptions: { timeout: 20_000, maxWait: 10_000 },
  });

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;
