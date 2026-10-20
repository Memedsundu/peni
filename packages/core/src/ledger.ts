import { PeniError } from "./errors";
import { assertWholeNumber, type Peni } from "./money";

/**
 * The peni ledger is double-entry and append-only.
 *
 * Every movement is one transaction whose entries sum to zero, so peni is never
 * created or destroyed silently: what a café issues shows up as a negative
 * balance on its `issuance` account, and what it gives away shows up on its
 * `redemption` account. Corrections are made with reversing transactions,
 * never by editing history.
 *
 * Accounts are plain strings so they store well:
 *
 *   member:<membershipId>      a customer's wallet at one café          (never negative)
 *   askida:<cafeId>            the café's open askıda kahve pool          (never negative)
 *   gift_escrow:<cafeId>       gifts sent but not yet accepted            (never negative)
 *   issuance:<cafeId>          source of earned and café-matched peni     (system)
 *   redemption:<cafeId>        sink for peni spent on orders              (system)
 *   till_donation:<cafeId>     askı coffees paid in cash at the till      (system)
 */
export const account = {
  member: (membershipId: string) => `member:${membershipId}`,
  askida: (cafeId: string) => `askida:${cafeId}`,
  giftEscrow: (cafeId: string) => `gift_escrow:${cafeId}`,
  issuance: (cafeId: string) => `issuance:${cafeId}`,
  redemption: (cafeId: string) => `redemption:${cafeId}`,
  tillDonation: (cafeId: string) => `till_donation:${cafeId}`,
} as const;

const NON_NEGATIVE_PREFIXES = ["member:", "askida:", "gift_escrow:"];

export function isNonNegativeAccount(accountId: string): boolean {
  return NON_NEGATIVE_PREFIXES.some((prefix) => accountId.startsWith(prefix));
}

export type TransactionKind =
  | "earn"
  | "redeem"
  | "gift_send"
  | "gift_accept"
  | "gift_return"
  | "askida_donate"
  | "askida_match"
  | "askida_till"
  | "askida_claim"
  | "adjust"
  | "reversal";

export interface LedgerEntry {
  account: string;
  delta: Peni;
}

export type TransactionMeta = Record<string, string | number | boolean | null>;

export interface LedgerTransaction {
  id: string;
  cafeId: string;
  kind: TransactionKind;
  entries: LedgerEntry[];
  /** Same key twice = same operation. Replays return the original transaction. */
  idempotencyKey: string;
  reversesId: string | null;
  meta: TransactionMeta;
  createdAt: Date;
}

export interface PostTransactionInput {
  cafeId: string;
  kind: TransactionKind;
  entries: LedgerEntry[];
  idempotencyKey: string;
  reversesId?: string | null;
  meta?: TransactionMeta;
  createdAt?: Date;
}

export interface TransactionQuery {
  cafeId: string;
  kinds?: TransactionKind[];
  since?: Date;
  /** Only transactions with an entry on this account. */
  account?: string;
}

/** Storage behind the ledger. The in-memory store is for tests and demos; production uses Postgres. */
export interface LedgerStore {
  findByIdempotencyKey(key: string): Promise<LedgerTransaction | null>;
  findById(id: string): Promise<LedgerTransaction | null>;
  balance(accountId: string): Promise<Peni>;
  append(transaction: LedgerTransaction): Promise<void>;
  query(query: TransactionQuery): Promise<LedgerTransaction[]>;
  /** Runs `fn` atomically and serialized against other ledger writes. Not re-entrant. */
  atomically<T>(fn: () => Promise<T>): Promise<T>;
}

export class Ledger {
  constructor(private readonly store: LedgerStore) {}

  balance(accountId: string): Promise<Peni> {
    return this.store.balance(accountId);
  }

  query(query: TransactionQuery): Promise<LedgerTransaction[]> {
    return this.store.query(query);
  }

  findById(id: string): Promise<LedgerTransaction | null> {
    return this.store.findById(id);
  }

  findByIdempotencyKey(key: string): Promise<LedgerTransaction | null> {
    return this.store.findByIdempotencyKey(key);
  }

  atomically<T>(fn: () => Promise<T>): Promise<T> {
    return this.store.atomically(fn);
  }

  /**
   * Posts a balanced transaction. Must be called inside `atomically` when the
   * caller also reads balances to make a decision; `post` itself re-checks the
   * non-negative rule so a race can never overdraw a wallet or the askı.
   */
  async post(input: PostTransactionInput): Promise<LedgerTransaction> {
    validateShape(input);

    const existing = await this.store.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (!sameOperation(existing, input)) {
        throw new PeniError(
          "IDEMPOTENCY_CONFLICT",
          `Idempotency key ${input.idempotencyKey} was already used for a different operation`,
        );
      }
      return existing;
    }

    for (const [accountId, delta] of netByAccount(input.entries)) {
      if (delta < 0 && isNonNegativeAccount(accountId)) {
        const balance = await this.store.balance(accountId);
        if (balance + delta < 0) {
          throw new PeniError(
            "INSUFFICIENT_BALANCE",
            `${accountId} has ${balance} pennies, needs ${-delta}`,
          );
        }
      }
    }

    const transaction: LedgerTransaction = {
      id: crypto.randomUUID(),
      cafeId: input.cafeId,
      kind: input.kind,
      entries: input.entries.map((e) => ({ ...e })),
      idempotencyKey: input.idempotencyKey,
      reversesId: input.reversesId ?? null,
      meta: { ...(input.meta ?? {}) },
      createdAt: input.createdAt ?? new Date(),
    };
    await this.store.append(transaction);
    return transaction;
  }

  /**
   * Posts the exact opposite of `transactionId`. Fails with INSUFFICIENT_BALANCE
   * if the peni has already been spent; callers that must always succeed (refunds)
   * use `post` with a clamped amount instead.
   */
  async reverse(
    transactionId: string,
    meta: TransactionMeta = {},
    createdAt?: Date,
  ): Promise<LedgerTransaction> {
    const original = await this.store.findById(transactionId);
    if (!original) throw new PeniError("NOT_FOUND", `Transaction ${transactionId} not found`);
    return this.post({
      cafeId: original.cafeId,
      kind: "reversal",
      entries: original.entries.map((e) => ({ account: e.account, delta: -e.delta })),
      idempotencyKey: `reversal:${original.id}`,
      reversesId: original.id,
      meta: { reversedKind: original.kind, ...meta },
      createdAt,
    });
  }
}

function validateShape(input: PostTransactionInput): void {
  if (!input.idempotencyKey) {
    throw new PeniError("INVALID_TRANSACTION", "idempotencyKey is required");
  }
  if (input.entries.length < 2) {
    throw new PeniError("INVALID_TRANSACTION", "A transaction needs at least two entries");
  }
  let sum = 0;
  for (const entry of input.entries) {
    assertWholeNumber(entry.delta, `delta for ${entry.account}`);
    if (entry.delta === 0) {
      throw new PeniError("INVALID_TRANSACTION", `Zero entry on ${entry.account}`);
    }
    sum += entry.delta;
  }
  if (sum !== 0) {
    throw new PeniError("INVALID_TRANSACTION", `Entries must sum to zero, got ${sum}`);
  }
}

function netByAccount(entries: LedgerEntry[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const entry of entries) net.set(entry.account, (net.get(entry.account) ?? 0) + entry.delta);
  return net;
}

function sameOperation(existing: LedgerTransaction, input: PostTransactionInput): boolean {
  if (existing.kind !== input.kind || existing.cafeId !== input.cafeId) return false;
  const a = [...netByAccount(existing.entries)].sort(([x], [y]) => x.localeCompare(y));
  const b = [...netByAccount(input.entries)].sort(([x], [y]) => x.localeCompare(y));
  return a.length === b.length && a.every(([acc, d], i) => b[i]![0] === acc && b[i]![1] === d);
}

/** Simple, correct, single-process store. Writes are serialized through a promise chain. */
export class InMemoryLedgerStore implements LedgerStore {
  private readonly transactions: LedgerTransaction[] = [];
  private readonly byKey = new Map<string, LedgerTransaction>();
  private readonly byId = new Map<string, LedgerTransaction>();
  private readonly balances = new Map<string, number>();
  private chain: Promise<unknown> = Promise.resolve();

  async findByIdempotencyKey(key: string) {
    return this.byKey.get(key) ?? null;
  }

  async findById(id: string) {
    return this.byId.get(id) ?? null;
  }

  async balance(accountId: string) {
    return this.balances.get(accountId) ?? 0;
  }

  async append(transaction: LedgerTransaction) {
    if (this.byKey.has(transaction.idempotencyKey)) {
      throw new PeniError("IDEMPOTENCY_CONFLICT", `Duplicate key ${transaction.idempotencyKey}`);
    }
    this.transactions.push(transaction);
    this.byKey.set(transaction.idempotencyKey, transaction);
    this.byId.set(transaction.id, transaction);
    for (const entry of transaction.entries) {
      this.balances.set(entry.account, (this.balances.get(entry.account) ?? 0) + entry.delta);
    }
  }

  async query(query: TransactionQuery) {
    return this.transactions.filter(
      (t) =>
        t.cafeId === query.cafeId &&
        (!query.kinds || query.kinds.includes(t.kind)) &&
        (!query.since || t.createdAt >= query.since) &&
        (!query.account || t.entries.some((e) => e.account === query.account)),
    );
  }

  /** Not re-entrant: calling `atomically` from inside `fn` deadlocks. */
  async atomically<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }
}
