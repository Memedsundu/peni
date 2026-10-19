import type { Bill } from "./bills";
import type { Kurus } from "./money";
import type { Order } from "./orders";
import { plusDays } from "./shifts";
import { MILLI } from "./stock";
import { weekdayOf } from "./tasks";

/**
 * Gözcü (plan piece 31): Peni keeping an eye out for the owner. Price watch (C12), unusual
 * activity (C13), a cash-flow forecast (C14), order suggestions (C15) and staffing hints
 * (C16). All of it is worked out from the café's own records whenever it is looked at, so it
 * needs no assistant and is never stale. What an owner has seen and let go is remembered.
 */

// ─────────────────────────────────────────────── how far it looks, and what counts

/** Prices on bills of the last this many days. */
export const WATCH_PRICE_DAYS = 30;
/** A product's margin has to fall at least this many points to be worth a look. */
export const WATCH_MARGIN_DROP = 2;
/** Unusual activity in the last this many days. */
export const WATCH_DAYS = 7;
/** What a person's voids and refunds are compared with: the weeks before. */
export const WATCH_BASELINE_WEEKS = 4;
/** At least this many voids and refunds by one person in the week, and twice their usual. */
export const WATCH_VOIDS_MIN = 3;
/** A drawer count off by this much or more. */
export const WATCH_CASH_GAP: Kurus = 5_000;
/** A bill this many times the supplier's usual is a spike. */
export const WATCH_SPIKE_TIMES = 2;
/** Two bills from the same supplier for the same amount this close together may be one bill twice. */
export const WATCH_TWICE_DAYS = 10;
/** The forecast runs this many days ahead. */
export const FORECAST_DAYS = 30;
/** Sales and spending are expected from the last this many days. */
export const FORECAST_HISTORY_DAYS = 28;
/** Stock is suggested for this many days of sales when it would run out sooner. */
export const ORDER_COVER_DAYS = 10;
/** An item is worth ordering when it lasts fewer days than this. */
export const ORDER_WITHIN_DAYS = 7;
/** Orders per person per hour when the café has no past shifts to judge by. */
export const STAFFING_DEFAULT_LOAD = 12;
/** An hour is busy at this many times the café's usual orders per person, quiet below this share. */
export const STAFFING_BUSY = 1.6;
export const STAFFING_QUIET = 0.4;
/** …and only when one person has at least this many orders an hour; fewer is never "busy". */
export const STAFFING_BUSY_MIN = 8;
/** Hours with fewer orders than this are left alone. */
export const STAFFING_MIN_ORDERS = 4;

// ─────────────────────────────────────────────── what was seen

export interface WatchDismissal {
  cafeId: string;
  /** The finding's own key: "cash:<session>", "twice:<bill>:<bill>"… */
  key: string;
  memberId: string;
  note: string | null;
  at: Date;
}

export interface WatchStore {
  listDismissed(cafeId: string): Promise<WatchDismissal[]>;
  /** Marks it seen; a second time keeps the first. */
  dismiss(d: WatchDismissal): Promise<void>;
  undismiss(cafeId: string, key: string): Promise<void>;
}

export class InMemoryWatchStore implements WatchStore {
  private readonly seen = new Map<string, WatchDismissal>();

  async listDismissed(cafeId: string) {
    return [...this.seen.values()].filter((d) => d.cafeId === cafeId).map((d) => ({ ...d }));
  }
  async dismiss(d: WatchDismissal) {
    const k = `${d.cafeId}:${d.key}`;
    if (!this.seen.has(k)) this.seen.set(k, { ...d });
  }
  async undismiss(cafeId: string, key: string) {
    this.seen.delete(`${cafeId}:${key}`);
  }
}

// ─────────────────────────────────────────────── C12: prices

/** A menu price as cafés set them: up to the next ₺5 from ₺50, else the next lira. */
export function roundPrice(kurus: Kurus): Kurus {
  const step = kurus >= 5_000 ? 500 : 100;
  return Math.ceil(kurus / step) * step;
}

/** The price that gives back the margin a product had, at its new cost. */
export function priceForMargin(costKurus: Kurus, marginPct: number): Kurus | null {
  if (marginPct >= 100 || costKurus <= 0) return null;
  return roundPrice(Math.ceil((costKurus * 100) / (100 - marginPct)));
}

export function marginPct(priceKurus: Kurus, costKurus: Kurus): number {
  return priceKurus > 0 ? Math.round(((priceKurus - costKurus) / priceKurus) * 100) : 0;
}

// ─────────────────────────────────────────────── C13: unusual activity

export interface VoidsByPerson {
  memberId: string;
  /** Voids and refunds this week. */
  count: number;
  /** A week's on average in the weeks before. */
  usual: number;
  orderIds: string[];
}

/**
 * People who voided or refunded more than they usually do: at least WATCH_VOIDS_MIN this
 * week and twice their own weekly average of the four weeks before.
 */
export function unusualVoids(
  orders: readonly Pick<Order, "id" | "voidedAt" | "voidedByMemberId" | "refundedAt" | "refundedByMemberId">[],
  now: Date,
): VoidsByPerson[] {
  const weekAgo = now.getTime() - WATCH_DAYS * 86_400_000;
  const since = weekAgo - WATCH_BASELINE_WEEKS * 7 * 86_400_000;
  const by = new Map<string, { now: string[]; before: number }>();
  for (const o of orders)
    for (const [at, who] of [
      [o.voidedAt, o.voidedByMemberId],
      [o.refundedAt, o.refundedByMemberId],
    ] as const) {
      if (!at || !who || at.getTime() < since || at.getTime() > now.getTime()) continue;
      const row = by.get(who) ?? { now: [], before: 0 };
      if (at.getTime() >= weekAgo) row.now.push(o.id);
      else row.before++;
      by.set(who, row);
    }
  return [...by.entries()]
    .map(([memberId, r]) => ({ memberId, count: r.now.length, usual: Math.round((r.before / WATCH_BASELINE_WEEKS) * 10) / 10, orderIds: r.now }))
    .filter((r) => r.count >= WATCH_VOIDS_MIN && r.count >= 2 * r.usual)
    .sort((a, b) => b.count - a.count);
}

type B = Pick<Bill, "id" | "supplierId" | "date" | "totalKurus" | "voidedAt">;

/** Bills well above what the same supplier usually sends: twice the middle of its last bills. */
export function billSpikes(bills: readonly B[], from: string): { billId: string; usualKurus: Kurus }[] {
  const out: { billId: string; usualKurus: Kurus }[] = [];
  const live = bills.filter((b) => !b.voidedAt && b.supplierId);
  for (const b of live) {
    if (b.date < from) continue;
    const before = live
      .filter((x) => x.supplierId === b.supplierId && x.id !== b.id && x.date < b.date)
      .sort((x, y) => y.date.localeCompare(x.date))
      .slice(0, 6)
      .map((x) => x.totalKurus)
      .sort((x, y) => x - y);
    if (before.length < 3) continue;
    const usual = before.length % 2 ? before[(before.length - 1) / 2]! : Math.round((before[before.length / 2 - 1]! + before[before.length / 2]!) / 2);
    if (usual > 0 && b.totalKurus >= WATCH_SPIKE_TIMES * usual) out.push({ billId: b.id, usualKurus: usual });
  }
  return out;
}

/** Two bills from one supplier for the same amount within a few days: maybe one bill entered twice. */
export function twiceBills(bills: readonly B[], from: string): [string, string][] {
  const live = bills.filter((b) => !b.voidedAt && b.supplierId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: [string, string][] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (b.date > plusDays(a.date, WATCH_TWICE_DAYS)) break;
      if (b.date < from) continue;
      if (a.supplierId === b.supplierId && a.totalKurus === b.totalKurus) out.push([a.id, b.id]);
    }
  return out;
}

// ─────────────────────────────────────────────── C14: cash flow

export interface ForecastEvent {
  day: string;
  /** Positive comes in, negative goes out. */
  kurus: Kurus;
  kind: "bill" | "check" | "card" | "wages" | "rent" | "loan";
  label: string;
}

export interface ForecastDay {
  day: string;
  inKurus: Kurus;
  outKurus: Kurus;
  /** At the end of the day; from zero when the café's money isn't tracked. */
  balanceKurus: Kurus;
}

/**
 * Day by day from today: what the money will be if sales come in as usual for the weekday,
 * everyday buying goes on as usual, and everything owed is paid on its day.
 */
export function forecast(input: {
  today: string;
  days: number;
  startKurus: Kurus;
  /** Expected sales, Monday (1) to Sunday (7). */
  salesByWeekday: ReadonlyMap<number, Kurus>;
  /** Everyday buying, per day. */
  dailySpendKurus: Kurus;
  events: readonly ForecastEvent[];
}): { days: ForecastDay[]; lowest: { day: string; balanceKurus: Kurus } } {
  const days: ForecastDay[] = [];
  let balance = input.startKurus;
  let lowest = { day: input.today, balanceKurus: balance };
  for (let i = 0; i < input.days; i++) {
    const day = plusDays(input.today, i);
    let inK = input.salesByWeekday.get(weekdayOf(day)) ?? 0;
    let outK = input.dailySpendKurus;
    for (const e of input.events) {
      if (e.day !== day) continue;
      if (e.kurus >= 0) inK += e.kurus;
      else outK += -e.kurus;
    }
    balance += inK - outK;
    days.push({ day, inKurus: inK, outKurus: outK, balanceKurus: balance });
    if (balance < lowest.balanceKurus) lowest = { day, balanceKurus: balance };
  }
  return { days, lowest };
}

// ─────────────────────────────────────────────── C15: what to order

/**
 * How much to order so it lasts ORDER_COVER_DAYS and stays above its low mark, in whole
 * kg, litres or pieces; null when it lasts long enough or isn't used.
 */
export function orderAmount(input: { qtyMilli: number; minMilli: number; usedPerDayMilli: number }): { orderMilli: number; daysLeft: number } | null {
  const { qtyMilli, minMilli, usedPerDayMilli } = input;
  if (usedPerDayMilli <= 0) return null;
  const daysLeft = Math.max(0, (qtyMilli - minMilli) / usedPerDayMilli);
  if (daysLeft >= ORDER_WITHIN_DAYS) return null;
  const need = usedPerDayMilli * ORDER_COVER_DAYS + minMilli - Math.max(0, qtyMilli);
  return { orderMilli: Math.max(MILLI, Math.ceil(need / MILLI) * MILLI), daysLeft: Math.floor(daysLeft * 10) / 10 };
}

// ─────────────────────────────────────────────── C16: people on shift

export interface StaffingSlot {
  /** Monday (1) to Sunday (7). */
  weekday: number;
  hour: number;
  /** Orders in that hour on an average such weekday. */
  orders: number;
  /** People planned then. */
  people: number;
}

export interface StaffingHint {
  kind: "busy" | "nobody" | "quiet";
  weekday: number;
  fromHour: number;
  /** The hour after the last one. */
  toHour: number;
  /** Average orders an hour across those hours. */
  orders: number;
  people: number;
}

/**
 * Hours that look short- or over-staffed against the café's usual orders per person-hour,
 * joined into runs: "Pazar 14:00–17:00, saatte 9 sipariş, 1 kişi".
 */
export function staffingHints(slots: readonly StaffingSlot[], usualLoad: number): StaffingHint[] {
  const kindOf = (s: StaffingSlot): StaffingHint["kind"] | null => {
    if (s.orders < STAFFING_MIN_ORDERS) return null;
    if (s.people === 0) return "nobody";
    const load = s.orders / s.people;
    if (load >= STAFFING_BUSY * usualLoad && load >= STAFFING_BUSY_MIN) return "busy";
    if (s.people >= 2 && load <= STAFFING_QUIET * usualLoad) return "quiet";
    return null;
  };
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
  const hints: StaffingHint[] = [];
  let run: { kind: StaffingHint["kind"]; slots: StaffingSlot[] } | null = null;
  const flush = () => {
    if (!run) return;
    const n = run.slots.length;
    hints.push({
      kind: run.kind,
      weekday: run.slots[0]!.weekday,
      fromHour: run.slots[0]!.hour,
      toHour: run.slots[n - 1]!.hour + 1,
      orders: Math.round(run.slots.reduce((s, x) => s + x.orders, 0) / n),
      people: Math.min(...run.slots.map((x) => x.people)),
    });
    run = null;
  };
  for (const s of sorted) {
    const kind = kindOf(s);
    const last = run?.slots.at(-1);
    if (run && (!kind || kind !== run.kind || !last || last.weekday !== s.weekday || last.hour + 1 !== s.hour || last.people !== s.people)) flush();
    if (kind) {
      if (!run) run = { kind, slots: [] };
      run.slots.push(s);
    }
  }
  flush();
  return hints;
}
