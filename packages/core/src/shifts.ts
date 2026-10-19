import type { AnyClose, MoneyAccount } from "./books";
import type { Kurus } from "./money";
import type { StaffRole } from "./staff";

/**
 * Vardiyalar and Puantaj ve maaş (plan piece 21).
 *
 * Vardiyalar is only the plan: each shift is a day, a start and an end, and the people on
 * it. A week stays a draft, seen only by those who plan, until it is published.
 *
 * Puantaj is what was worked: minutes per person per day. Shelby kept one number per
 * person per week and split weeks across months by guesswork; a day belongs to one month,
 * so here nothing needs splitting. The plan fills in the days nobody typed yet.
 *
 * Pay is hours times the person's hourly rate on that day (a rate starts on a day and
 * stays until the next one), as in Shelby. Pay is earned per month and paid out against a
 * month, from the drawer, the reserve or the bank, through Nakit ve banka. A pay month is
 * closed once its hours are all in, which keeps its hours and rates as they are; paying
 * what is still owed stays possible, as it did in Shelby.
 */

/** Shifts start and end on the quarter hour. */
export const SHIFT_STEP = 15;
export const DAY_MINUTES = 24 * 60;
export const SHIFT_NOTE_MAX = 200;
/** People on one shift. */
export const SHIFT_PEOPLE_MAX = 20;
/** The most an hourly rate can be: ₺10.000. */
export const RATE_MAX_KURUS = 1_000_000;
/** The most one payout can be: ₺1.000.000. */
export const PAYOUT_MAX_KURUS = 100_000_000;

export interface Shift {
  id: string;
  cafeId: string;
  /** "YYYY-MM-DD" in the café's time zone. */
  day: string;
  /** Minutes after midnight; the end is after the start, at most 24:00. */
  startMinutes: number;
  endMinutes: number;
  /** Staff members (StaffMember ids), in the order they were picked. */
  memberIds: string[];
  note: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A week (Monday first) is a draft until it is published. */
export interface ShiftWeek {
  cafeId: string;
  /** The Monday. */
  weekStart: string;
  publishedAt: Date | null;
  publishedById: string | null;
}

/** What one person worked on one day. */
export interface WorkDay {
  cafeId: string;
  memberId: string;
  day: string;
  minutes: number;
  note: string | null;
  byId: string;
  updatedAt: Date;
}

/** An hourly rate from a day on, until the next one. */
export interface PayRate {
  id: string;
  cafeId: string;
  memberId: string;
  fromDay: string;
  kurusPerHour: Kurus;
  byId: string;
  createdAt: Date;
}

export type PayMethod = "cash" | "bank";
export const PAY_METHODS: readonly PayMethod[] = ["cash", "bank"];

/** Money paid to one person against one month's pay. */
export interface PayPayout {
  id: string;
  cafeId: string;
  memberId: string;
  /** The pay month it counts against: "YYYY-MM". */
  month: string;
  amountKurus: Kurus;
  method: PayMethod;
  /** Where the money came from; null when money wasn't followed yet (piece 20). */
  account: MoneyAccount | null;
  paidOn: string;
  note: string | null;
  byId: string;
  createdAt: Date;
}

/** One person's month, as it was when the pay month was closed. */
export interface PaySummaryRow {
  memberId: string;
  name: string;
  role: StaffRole;
  minutes: number;
  earnedKurus: Kurus;
  paidKurus: Kurus;
}

export interface PaySummary {
  month: string;
  minutes: number;
  earnedKurus: Kurus;
  paidKurus: Kurus;
  people: PaySummaryRow[];
}

export interface PayClose extends AnyClose {
  id: string;
  cafeId: string;
  month: string;
  closedAt: Date;
  closedById: string;
  note: string | null;
  summary: PaySummary;
  reopenedAt: Date | null;
  reopenedById: string | null;
  reopenReason: string | null;
}

export interface PayoutQuery {
  month?: string;
  memberId?: string;
  /** Paid on or before this day. */
  paidThrough?: string;
}

export interface ShiftStore {
  /** Days from and through, inclusive; by day, then start. */
  listShifts(cafeId: string, from: string, through: string): Promise<Shift[]>;
  getShift(cafeId: string, id: string): Promise<Shift | null>;
  saveShift(shift: Shift): Promise<void>;
  /** Saves several at once (copying a week). Ids already there are left as they are. */
  addShifts(shifts: Shift[]): Promise<void>;
  removeShift(cafeId: string, id: string): Promise<void>;
  getWeek(cafeId: string, weekStart: string): Promise<ShiftWeek | null>;
  saveWeek(week: ShiftWeek): Promise<void>;

  /** Days from and through, inclusive. */
  listWorkDays(cafeId: string, from: string, through: string): Promise<WorkDay[]>;
  /** Sets these days and clears the cleared ones, together. */
  setWorkDays(cafeId: string, set: WorkDay[], cleared: { memberId: string; day: string }[]): Promise<void>;

  /** Oldest first. */
  listRates(cafeId: string): Promise<PayRate[]>;
  /** A rate from the same day for the same person replaces it. */
  saveRate(rate: PayRate): Promise<void>;
  removeRate(cafeId: string, id: string): Promise<void>;

  /** Oldest first. */
  listPayouts(cafeId: string, query?: PayoutQuery): Promise<PayPayout[]>;
  getPayout(cafeId: string, id: string): Promise<PayPayout | null>;
  addPayout(payout: PayPayout): Promise<void>;
  removePayout(cafeId: string, id: string): Promise<void>;

  /** Newest first, reopened ones too. */
  listPayCloses(cafeId: string): Promise<PayClose[]>;
  getPayClose(cafeId: string, id: string): Promise<PayClose | null>;
  /** False when that month already has a close standing. */
  savePayClose(close: PayClose): Promise<boolean>;
}

// ─────────────────────────────────────────────── days and weeks

const DAY_MS = 86_400_000;

/** "2026-10-16" plus n days. */
export function plusDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the day's week. */
export function weekStartOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return plusDays(day, -((weekday + 6) % 7));
}

/** The week's seven days, Monday first. */
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => plusDays(weekStart, i));
}

export function isMonday(day: string): boolean {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
}

export function shiftMinutes(s: Pick<Shift, "startMinutes" | "endMinutes">): number {
  return s.endMinutes - s.startMinutes;
}

/** Why a shift's times are not accepted, or null. */
export function shiftTimesProblem(startMinutes: number, endMinutes: number): "SHIFT_TIMES" | null {
  const onStep = (m: number) => Number.isInteger(m) && m % SHIFT_STEP === 0;
  if (!onStep(startMinutes) || !onStep(endMinutes) || startMinutes < 0 || endMinutes > DAY_MINUTES || endMinutes <= startMinutes) return "SHIFT_TIMES";
  return null;
}

/** Whether two shifts on the same day share any minute. */
export function overlaps(a: Pick<Shift, "startMinutes" | "endMinutes">, b: Pick<Shift, "startMinutes" | "endMinutes">): boolean {
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/** Minutes each person is planned on each day: "memberId|day" → minutes. */
export function plannedMinutes(shifts: Shift[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shifts) for (const m of s.memberIds) out.set(`${m}|${s.day}`, (out.get(`${m}|${s.day}`) ?? 0) + shiftMinutes(s));
  return out;
}

// ─────────────────────────────────────────────── pay

/** The person's hourly rate on a day, or null when none was set by then. */
export function rateOn(rates: PayRate[], memberId: string, day: string): Kurus | null {
  let best: PayRate | null = null;
  for (const r of rates) if (r.memberId === memberId && r.fromDay <= day && (!best || r.fromDay > best.fromDay)) best = r;
  return best ? best.kurusPerHour : null;
}

/** A day's pay, to the kuruş. */
export function dayPay(minutes: number, kurusPerHour: Kurus | null): Kurus {
  return kurusPerHour === null ? 0 : Math.round((minutes * kurusPerHour) / 60);
}

/** Pay earned by each person over these days: memberId → minutes and kuruş. */
export function earned(days: WorkDay[], rates: PayRate[]): Map<string, { minutes: number; kurus: Kurus }> {
  const out = new Map<string, { minutes: number; kurus: Kurus }>();
  for (const d of days) {
    const e = out.get(d.memberId) ?? { minutes: 0, kurus: 0 };
    e.minutes += d.minutes;
    e.kurus += dayPay(d.minutes, rateOn(rates, d.memberId, d.day));
    out.set(d.memberId, e);
  }
  return out;
}

/**
 * What each person is still owed, per pay month: pay earned for the month's days less
 * what was paid against that month. Only what's owed (more than zero) is kept.
 */
export function owedByMonth(days: WorkDay[], rates: PayRate[], payouts: PayPayout[]): Map<string, Map<string, Kurus>> {
  const out = new Map<string, Map<string, Kurus>>();
  const add = (memberId: string, month: string, kurus: Kurus) => {
    const months = out.get(memberId) ?? new Map<string, Kurus>();
    months.set(month, (months.get(month) ?? 0) + kurus);
    out.set(memberId, months);
  };
  for (const d of days) add(d.memberId, d.day.slice(0, 7), dayPay(d.minutes, rateOn(rates, d.memberId, d.day)));
  for (const p of payouts) add(p.memberId, p.month, -p.amountKurus);
  for (const [memberId, months] of out) {
    for (const [month, kurus] of months) if (kurus <= 0) months.delete(month);
    if (!months.size) out.delete(memberId);
  }
  return out;
}

// ─────────────────────────────────────────────── in memory

export class InMemoryShiftStore implements ShiftStore {
  private readonly shifts = new Map<string, Shift>();
  private readonly weeks = new Map<string, ShiftWeek>();
  private readonly days = new Map<string, WorkDay>();
  private readonly rates = new Map<string, PayRate>();
  private readonly payouts = new Map<string, PayPayout>();
  private readonly closes = new Map<string, PayClose>();

  async listShifts(cafeId: string, from: string, through: string) {
    return [...this.shifts.values()]
      .filter((s) => s.cafeId === cafeId && s.day >= from && s.day <= through)
      .sort((a, b) => a.day.localeCompare(b.day) || a.startMinutes - b.startMinutes || a.createdAt.getTime() - b.createdAt.getTime())
      .map(cloneShift);
  }

  async getShift(cafeId: string, id: string) {
    const s = this.shifts.get(id);
    return s && s.cafeId === cafeId ? cloneShift(s) : null;
  }

  async saveShift(shift: Shift) {
    this.shifts.set(shift.id, cloneShift(shift));
  }

  async addShifts(shifts: Shift[]) {
    for (const s of shifts) if (!this.shifts.has(s.id)) this.shifts.set(s.id, cloneShift(s));
  }

  async removeShift(cafeId: string, id: string) {
    if (this.shifts.get(id)?.cafeId === cafeId) this.shifts.delete(id);
  }

  async getWeek(cafeId: string, weekStart: string) {
    const w = this.weeks.get(`${cafeId}|${weekStart}`);
    return w ? { ...w } : null;
  }

  async saveWeek(week: ShiftWeek) {
    this.weeks.set(`${week.cafeId}|${week.weekStart}`, { ...week });
  }

  async listWorkDays(cafeId: string, from: string, through: string) {
    return [...this.days.values()]
      .filter((d) => d.cafeId === cafeId && d.day >= from && d.day <= through)
      .sort((a, b) => a.day.localeCompare(b.day) || a.memberId.localeCompare(b.memberId))
      .map((d) => ({ ...d }));
  }

  async setWorkDays(cafeId: string, set: WorkDay[], cleared: { memberId: string; day: string }[]) {
    for (const c of cleared) this.days.delete(`${cafeId}|${c.memberId}|${c.day}`);
    for (const d of set) this.days.set(`${cafeId}|${d.memberId}|${d.day}`, { ...d, cafeId });
  }

  async listRates(cafeId: string) {
    return [...this.rates.values()]
      .filter((r) => r.cafeId === cafeId)
      .sort((a, b) => a.fromDay.localeCompare(b.fromDay) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ ...r }));
  }

  async saveRate(rate: PayRate) {
    for (const [id, r] of this.rates) if (r.cafeId === rate.cafeId && r.memberId === rate.memberId && r.fromDay === rate.fromDay) this.rates.delete(id);
    this.rates.set(rate.id, { ...rate });
  }

  async removeRate(cafeId: string, id: string) {
    if (this.rates.get(id)?.cafeId === cafeId) this.rates.delete(id);
  }

  async listPayouts(cafeId: string, q: PayoutQuery = {}) {
    return [...this.payouts.values()]
      .filter(
        (p) =>
          p.cafeId === cafeId &&
          (!q.month || p.month === q.month) &&
          (!q.memberId || p.memberId === q.memberId) &&
          (!q.paidThrough || p.paidOn <= q.paidThrough),
      )
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => ({ ...p }));
  }

  async getPayout(cafeId: string, id: string) {
    const p = this.payouts.get(id);
    return p && p.cafeId === cafeId ? { ...p } : null;
  }

  async addPayout(payout: PayPayout) {
    if (!this.payouts.has(payout.id)) this.payouts.set(payout.id, { ...payout });
  }

  async removePayout(cafeId: string, id: string) {
    if (this.payouts.get(id)?.cafeId === cafeId) this.payouts.delete(id);
  }

  async listPayCloses(cafeId: string) {
    return [...this.closes.values()]
      .filter((c) => c.cafeId === cafeId)
      .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
      .map(cloneClose);
  }

  async getPayClose(cafeId: string, id: string) {
    const c = this.closes.get(id);
    return c && c.cafeId === cafeId ? cloneClose(c) : null;
  }

  async savePayClose(close: PayClose) {
    const clash = [...this.closes.values()].some((c) => c.cafeId === close.cafeId && c.id !== close.id && c.month === close.month && !c.reopenedAt);
    if (clash && !close.reopenedAt) return false;
    this.closes.set(close.id, cloneClose(close));
    return true;
  }
}

function cloneShift(s: Shift): Shift {
  return { ...s, memberIds: [...s.memberIds] };
}

function cloneClose(c: PayClose): PayClose {
  return { ...c, summary: structuredClone(c.summary) };
}
