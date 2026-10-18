import { AsyncLocalStorage } from "node:async_hooks";
import type { LedgerStore, LedgerTransaction, TransactionQuery } from "@peni/core";
import { Prisma, type PrismaClient } from "./generated/client";

type Tx = Prisma.TransactionClient;

/** Any number; it only has to be the same for every Peni process. */
const LEDGER_LOCK_KEY = 7_344_801;

/**
 * Postgres-backed ledger store.
 *
 * `atomically` opens one DB transaction and takes a transaction-scoped advisory
 * lock, so balance checks and writes never interleave. Everything that runs
 * inside it uses the same transaction through AsyncLocalStorage.
 *
 * The lock is global for now — fine for a handful of cafés. When that stops
 * being true, give `atomically` a café id and lock per café.
 */
export class PrismaLedgerStore implements LedgerStore {
  private readonly current = new AsyncLocalStorage<Tx>();

  constructor(private readonly prisma: PrismaClient) {}

  /** The open transaction inside `atomically`, else the client. Other Prisma stores read and write through it too. */
  get db(): Tx | PrismaClient {
    return this.current.getStore() ?? this.prisma;
  }

  async atomically<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LEDGER_LOCK_KEY})`;
      return this.current.run(tx, fn);
    });
  }

  async findByIdempotencyKey(key: string) {
    const row = await this.db.ledgerTransaction.findUnique({ where: { idempotencyKey: key }, include: { entries: true } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string) {
    const row = await this.db.ledgerTransaction.findUnique({ where: { id }, include: { entries: true } });
    return row ? toDomain(row) : null;
  }

  async balance(account: string) {
    const row = await this.db.accountBalance.findUnique({ where: { account } });
    return row?.balance ?? 0;
  }

  async append(t: LedgerTransaction) {
    const write = async (tx: Tx) => {
      await tx.ledgerTransaction.create({
        data: {
          id: t.id,
          cafeId: t.cafeId,
          kind: t.kind,
          idempotencyKey: t.idempotencyKey,
          reversesId: t.reversesId,
          meta: t.meta,
          createdAt: t.createdAt,
          entries: { create: t.entries.map((e) => ({ account: e.account, delta: e.delta })) },
        },
      });
      // Update first, insert if missing. Not INSERT … ON CONFLICT: Postgres checks the
      // non-negative CHECK against the proposed row (the bare delta) before merging,
      // which would reject a valid spend from an existing wallet.
      for (const e of t.entries) {
        const updated = await tx.$executeRaw`
          UPDATE "AccountBalance" SET balance = balance + ${e.delta}, "updatedAt" = now()
          WHERE account = ${e.account}`;
        if (updated === 0) {
          await tx.$executeRaw`
            INSERT INTO "AccountBalance" (account, balance, "updatedAt") VALUES (${e.account}, ${e.delta}, now())`;
        }
      }
    };
    const tx = this.current.getStore();
    if (tx) await write(tx);
    else await this.prisma.$transaction(write);
  }

  async query(q: TransactionQuery) {
    const rows = await this.db.ledgerTransaction.findMany({
      where: {
        cafeId: q.cafeId,
        ...(q.kinds ? { kind: { in: q.kinds } } : {}),
        ...(q.since ? { createdAt: { gte: q.since } } : {}),
        ...(q.account ? { entries: { some: { account: q.account } } } : {}),
      },
      include: { entries: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDomain);
  }
}

function toDomain(
  row: Prisma.LedgerTransactionGetPayload<{ include: { entries: true } }>,
): LedgerTransaction {
  return {
    id: row.id,
    cafeId: row.cafeId,
    kind: row.kind,
    idempotencyKey: row.idempotencyKey,
    reversesId: row.reversesId,
    meta: (row.meta ?? {}) as LedgerTransaction["meta"],
    createdAt: row.createdAt,
    entries: row.entries.map((e) => ({ account: e.account, delta: e.delta })),
  };
}
