import type { Kurus } from "./money";

/**
 * Nakit ve banka and Ay kapanışı (plan piece 20).
 *
 * The café's money sits in three places, as in Shelby: the drawer at the till (Yazar
 * kasa), cash kept aside in the back (Ayrı kasa) and the bank. The drawer is counted in
 * its Kasa sessions (piece 9), so what it holds comes from there. The other two are kept
 * here as movements: each one says which account, how much in or out, and what made it.
 *
 * Nothing is tracked until the café starts (Başlangıç) with what the reserve and the bank
 * hold that day. From then on card sales go into the bank on the day they're taken, and
 * every bill, check, repayment or card payment paid in cash or by bank takes the money
 * out of the account it came from. Undoing that payment takes its movement away with it.
 *
 * A month is closed (Ay kapanışı) once it is over: its numbers are kept as they were, and
 * nothing dated in it or before it can be added, changed or taken away until the owner
 * opens it again. Shelby did this with a one-off script and database triggers; here it is
 * a button, and the rule is checked wherever a dated record is written.
 */

export type MoneyAccount = "drawer" | "reserve" | "bank";
export const MONEY_ACCOUNTS: readonly MoneyAccount[] = ["drawer", "reserve", "bank"];
/** The accounts kept as movements here. The drawer is kept by its Kasa sessions. */
export type KeptAccount = Exclude<MoneyAccount, "drawer">;
export const KEPT_ACCOUNTS: readonly KeptAccount[] = ["reserve", "bank"];

export type MovementKind =
  /** What the account held on the day tracking started. */
  | "opening"
  /** From one account to another; the other side is `counterpart`. */
  | "transfer"
  /** The owner put money in, or took it out. */
  | "deposit"
  | "withdraw"
  /** Set to what the bank statement or a count says, with why. */
  | "correction"
  /** Paid out for a bill, a cashed check, a loan paid back, the credit card, or wages. */
  | "bill"
  | "check"
  | "repayment"
  | "card"
  | "wages";

export const MONEY_NOTE_MAX = 200;
/** The most one movement can be: ₺10.000.000. */
export const MONEY_MAX_KURUS = 1_000_000_000;

export interface MoneyMovement {
  id: string;
  cafeId: string;
  account: KeptAccount;
  /** In is positive, out is negative. */
  amountKurus: Kurus;
  kind: MovementKind;
  /** The other account of a transfer. */
  counterpart: MoneyAccount | null;
  /** What made it ("bill_payment:<id>", "check:<id>", "manual:<id>"…): one movement per account. */
  source: string;
  /** The day it counts on, in the café's time zone. */
  day: string;
  note: string | null;
  memberId: string;
  createdAt: Date;
}

/** The day the café started keeping its money here. */
export interface MoneyStart {
  cafeId: string;
  startedOn: string;
  memberId: string;
  createdAt: Date;
}

/** A month's numbers, as they were when it was closed. */
export interface MonthSummary {
  month: string;
  from: string;
  to: string;
  /** Approved payments at the till less refunds, by cash and by card. */
  sales: { cashKurus: Kurus; cardKurus: Kurus; totalKurus: Kurus };
  /** Bills dated in the month, and what was paid on bills in it, by how. */
  bills: { count: number; totalKurus: Kurus; paidKurus: Record<string, Kurus> };
  /** Pay earned for hours worked in the month (Puantaj ve maaş), and what was paid out in it. */
  wages: { earnedKurus: Kurus; paidKurus: Kurus };
  /** What each account held at the end of the month; null when it wasn't tracked yet. */
  money: { drawerKurus: Kurus | null; reserveKurus: Kurus | null; bankKurus: Kurus | null };
  /** What was owed at the end of the month. */
  owed: { billsKurus: Kurus; checksKurus: Kurus; loansKurus: Kurus; cardKurus: Kurus; wagesKurus: Kurus; totalKurus: Kurus };
}

export interface MonthClose {
  id: string;
  cafeId: string;
  /** "YYYY-MM". */
  month: string;
  closedAt: Date;
  closedById: string;
  note: string | null;
  summary: MonthSummary;
  /** Set when the owner opened it again; a reopened month can be closed again as a new close. */
  reopenedAt: Date | null;
  reopenedById: string | null;
  reopenReason: string | null;
}

export interface MovementQuery {
  account?: KeptAccount;
  /** Days from and through, inclusive. */
  since?: string;
  through?: string;
}

export interface BooksStore {
  getStart(cafeId: string): Promise<MoneyStart | null>;
  /** False when the café already started. */
  saveStart(start: MoneyStart): Promise<boolean>;
  /** Movements whose source and account are already there are left as they are. */
  addMovements(movements: MoneyMovement[]): Promise<void>;
  /** Newest day first. */
  listMovements(cafeId: string, query?: MovementQuery): Promise<MoneyMovement[]>;
  listBySource(cafeId: string, source: string): Promise<MoneyMovement[]>;
  removeBySource(cafeId: string, source: string): Promise<void>;
  /** What the movements add up to per account, through a day when given. */
  totals(cafeId: string, through?: string): Promise<Record<KeptAccount, Kurus>>;
  /** Newest first, reopened ones too. */
  listCloses(cafeId: string): Promise<MonthClose[]>;
  getClose(cafeId: string, id: string): Promise<MonthClose | null>;
  /** False when that month already has a close standing. */
  saveClose(close: MonthClose): Promise<boolean>;
}

// ─────────────────────────────────────────────── months

/** "2026-10-16" → "2026-10". */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/** The first and last day of a month. */
export function monthDays(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function validMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** A month's close, here or for pay: closed, and maybe opened again. */
export interface AnyClose {
  month: string;
  reopenedAt: Date | null;
}

/** The closes still standing (not reopened), newest first. */
export function standingCloses<C extends AnyClose>(closes: C[]): C[] {
  return closes.filter((c) => !c.reopenedAt).sort((a, b) => b.month.localeCompare(a.month));
}

/** The last day nothing can be written on any more: the end of the latest standing close. */
export function closedThrough(closes: AnyClose[]): string | null {
  const latest = standingCloses(closes)[0];
  return latest ? monthDays(latest.month).to : null;
}

/**
 * The month that can be closed next: the one after the latest standing close, or last
 * month when none stands. Only a month that is over; null when that one isn't yet.
 */
export function nextMonthToClose(closes: AnyClose[], today: string): string | null {
  const latest = standingCloses(closes)[0];
  const next = latest ? addMonths(latest.month, 1) : addMonths(monthOf(today), -1);
  return next < monthOf(today) ? next : null;
}

// ─────────────────────────────────────────────── in memory

export class InMemoryBooksStore implements BooksStore {
  private readonly starts = new Map<string, MoneyStart>();
  private readonly movements: MoneyMovement[] = [];
  private readonly closes = new Map<string, MonthClose>();

  async getStart(cafeId: string) {
    const s = this.starts.get(cafeId);
    return s ? { ...s } : null;
  }

  async saveStart(start: MoneyStart) {
    if (this.starts.has(start.cafeId)) return false;
    this.starts.set(start.cafeId, { ...start });
    return true;
  }

  async addMovements(movements: MoneyMovement[]) {
    for (const m of movements) {
      if (this.movements.some((x) => x.cafeId === m.cafeId && x.source === m.source && x.account === m.account)) continue;
      this.movements.push({ ...m });
    }
  }

  async listMovements(cafeId: string, q: MovementQuery = {}) {
    return this.movements
      .filter((m) => m.cafeId === cafeId && (!q.account || m.account === q.account) && (!q.since || m.day >= q.since) && (!q.through || m.day <= q.through))
      .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.getTime() - a.createdAt.getTime())
      .map((m) => ({ ...m }));
  }

  async listBySource(cafeId: string, source: string) {
    return this.movements.filter((m) => m.cafeId === cafeId && m.source === source).map((m) => ({ ...m }));
  }

  async removeBySource(cafeId: string, source: string) {
    for (let i = this.movements.length - 1; i >= 0; i--) {
      const m = this.movements[i]!;
      if (m.cafeId === cafeId && m.source === source) this.movements.splice(i, 1);
    }
  }

  async totals(cafeId: string, through?: string) {
    const out: Record<KeptAccount, Kurus> = { reserve: 0, bank: 0 };
    for (const m of this.movements) if (m.cafeId === cafeId && (!through || m.day <= through)) out[m.account] += m.amountKurus;
    return out;
  }

  async listCloses(cafeId: string) {
    return [...this.closes.values()]
      .filter((c) => c.cafeId === cafeId)
      .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
      .map(cloneClose);
  }

  async getClose(cafeId: string, id: string) {
    const c = this.closes.get(id);
    return c && c.cafeId === cafeId ? cloneClose(c) : null;
  }

  async saveClose(close: MonthClose) {
    const clash = [...this.closes.values()].some((c) => c.cafeId === close.cafeId && c.id !== close.id && c.month === close.month && !c.reopenedAt);
    if (clash && !close.reopenedAt) return false;
    this.closes.set(close.id, cloneClose(close));
    return true;
  }
}

function cloneClose(c: MonthClose): MonthClose {
  return { ...c, summary: structuredClone(c.summary) };
}
