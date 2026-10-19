import type { Kurus } from "./money";
import type { Payment } from "./payments";

/**
 * Cash sessions (plan piece 9): the drawer is opened with a count, takes the day's cash,
 * and is closed with a count. The difference between what was counted and what should
 * be there is recorded with a reason, as in Shelby. One drawer per café for now; every
 * till computer at the café shares it.
 */

/** Turkish notes and coins in use, in kuruş, largest first. */
export const DENOMINATIONS: readonly Kurus[] = [
  20_000, 10_000, 5_000, 2_000, 1_000, 500, // notes: 200, 100, 50, 20, 10, 5 TL
  100, 50, 25, 10, 5, // coins: 1 TL, 50, 25, 10, 5 kuruş
];

/** How many of each note and coin, keyed by its value in kuruş: { "20000": 3, "500": 2 }. */
export type CashCounts = Record<string, number>;

export const MAX_PIECES = 10_000;

/** The total of a count by notes and coins; null when the counts aren't valid. */
export function countTotal(counts: CashCounts): Kurus | null {
  let total = 0;
  for (const [value, pieces] of Object.entries(counts)) {
    if (!DENOMINATIONS.includes(Number(value))) return null;
    if (!Number.isInteger(pieces) || pieces < 0 || pieces > MAX_PIECES) return null;
    total += Number(value) * pieces;
  }
  return total;
}

export interface CashCount {
  /** What should have been there; null the first time a café opens its drawer. */
  expectedKurus: Kurus | null;
  countKurus: Kurus;
  /** Counted minus expected: negative is missing money. */
  differenceKurus: Kurus;
  /** Notes and coins, when the count was done that way. */
  counts: CashCounts | null;
  /** Required when the count doesn't match. */
  note: string | null;
  at: Date;
  byMemberId: string;
}

export interface CashSession {
  id: string;
  cafeId: string;
  opening: CashCount;
  closing: CashCount | null;
  /** The client's keys, so a retried "open" or "close" counts once. */
  openKey: string;
  closeKey: string | null;
}

export type CashMoveKind = "in" | "out";

/** Money put into or taken out of the drawer by hand: change from the bank, milk from the market. */
export interface CashMove {
  id: string;
  cafeId: string;
  sessionId: string;
  kind: CashMoveKind;
  amountKurus: Kurus;
  reason: string;
  at: Date;
  byMemberId: string;
  key: string;
}

export interface CashTotals {
  cashSalesKurus: Kurus;
  cashRefundsKurus: Kurus;
  inKurus: Kurus;
  outKurus: Kurus;
  /** For checking against the card terminal's own end-of-day total. */
  cardSalesKurus: Kurus;
  cardRefundsKurus: Kurus;
  /** Opening count, plus cash taken and put in, less cash given back and taken out. */
  expectedKurus: Kurus;
}

/** What the drawer should hold, from its opening count, its approved payments and the moves. */
export function cashTotals(session: Pick<CashSession, "opening">, payments: Pick<Payment, "kind" | "method" | "status" | "amountKurus">[], moves: Pick<CashMove, "kind" | "amountKurus">[]): CashTotals {
  const sum = (kind: Payment["kind"], method: Payment["method"]) =>
    payments.filter((p) => p.status === "approved" && p.kind === kind && p.method === method).reduce((s, p) => s + p.amountKurus, 0);
  const moved = (kind: CashMoveKind) => moves.filter((m) => m.kind === kind).reduce((s, m) => s + m.amountKurus, 0);
  const totals = {
    cashSalesKurus: sum("sale", "cash"),
    cashRefundsKurus: sum("refund", "cash"),
    inKurus: moved("in"),
    outKurus: moved("out"),
    cardSalesKurus: sum("sale", "card"),
    cardRefundsKurus: sum("refund", "card"),
  };
  return {
    ...totals,
    expectedKurus: session.opening.countKurus + totals.cashSalesKurus - totals.cashRefundsKurus + totals.inKurus - totals.outKurus,
  };
}

export interface CashStore {
  /**
   * Creates or updates a session. A new open session is refused with `false` when the
   * café already has one open: another till opened the drawer a moment ago.
   */
  saveSession(session: CashSession): Promise<boolean>;
  getSession(cafeId: string, id: string): Promise<CashSession | null>;
  openSession(cafeId: string): Promise<CashSession | null>;
  /** The most recently closed one. */
  lastClosed(cafeId: string): Promise<CashSession | null>;
  findByKey(cafeId: string, key: string): Promise<CashSession | null>;
  /** Newest first. */
  listSessions(cafeId: string, limit: number): Promise<CashSession[]>;
  saveMove(move: CashMove): Promise<boolean>;
  findMoveByKey(cafeId: string, key: string): Promise<CashMove | null>;
  /** Oldest first. */
  listMoves(cafeId: string, sessionId: string): Promise<CashMove[]>;
  /** A move a bill payment or a transfer made, when that is undone while the drawer is still open (piece 20). */
  removeMove(cafeId: string, id: string): Promise<void>;
}

export class InMemoryCashStore implements CashStore {
  private readonly sessions = new Map<string, CashSession>();
  private readonly moves = new Map<string, CashMove>();

  async saveSession(session: CashSession) {
    const otherOpen = [...this.sessions.values()].some((s) => s.cafeId === session.cafeId && s.id !== session.id && !s.closing);
    if (!session.closing && otherOpen) return false;
    this.sessions.set(session.id, clone(session));
    return true;
  }

  async getSession(cafeId: string, id: string) {
    const s = this.sessions.get(id);
    return s && s.cafeId === cafeId ? clone(s) : null;
  }

  async openSession(cafeId: string) {
    const s = [...this.sessions.values()].find((x) => x.cafeId === cafeId && !x.closing);
    return s ? clone(s) : null;
  }

  async lastClosed(cafeId: string) {
    const closed = [...this.sessions.values()].filter((x) => x.cafeId === cafeId && x.closing);
    closed.sort((a, b) => b.closing!.at.getTime() - a.closing!.at.getTime());
    return closed[0] ? clone(closed[0]) : null;
  }

  async findByKey(cafeId: string, key: string) {
    const s = [...this.sessions.values()].find((x) => x.cafeId === cafeId && (x.openKey === key || x.closeKey === key));
    return s ? clone(s) : null;
  }

  async listSessions(cafeId: string, limit: number) {
    return [...this.sessions.values()]
      .filter((x) => x.cafeId === cafeId)
      .sort((a, b) => b.opening.at.getTime() - a.opening.at.getTime())
      .slice(0, limit)
      .map(clone);
  }

  async saveMove(move: CashMove) {
    if ([...this.moves.values()].some((m) => m.cafeId === move.cafeId && m.key === move.key && m.id !== move.id)) return false;
    this.moves.set(move.id, { ...move });
    return true;
  }

  async findMoveByKey(cafeId: string, key: string) {
    const m = [...this.moves.values()].find((x) => x.cafeId === cafeId && x.key === key);
    return m ? { ...m } : null;
  }

  async listMoves(cafeId: string, sessionId: string) {
    return [...this.moves.values()]
      .filter((m) => m.cafeId === cafeId && m.sessionId === sessionId)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((m) => ({ ...m }));
  }

  async removeMove(cafeId: string, id: string) {
    const m = this.moves.get(id);
    if (m && m.cafeId === cafeId) this.moves.delete(id);
  }
}

function clone(s: CashSession): CashSession {
  const count = (c: CashCount): CashCount => ({ ...c, counts: c.counts ? { ...c.counts } : null });
  return { ...s, opening: count(s.opening), closing: s.closing ? count(s.closing) : null };
}
