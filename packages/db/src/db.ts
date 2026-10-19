import type { Prisma, PrismaClient } from "./generated/client";

/** Where a store reads and writes: the ledger's open transaction when there is one, else the client. */
export type Db = () => Prisma.TransactionClient | PrismaClient;
