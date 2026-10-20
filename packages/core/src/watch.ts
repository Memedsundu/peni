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
 * needs no assistant and is never stale. What is "unusual" is judged against how much this
 * café's own numbers usually vary, not one bar for every café. What an owner has seen and let
 * go is remembered, and a kind of finding they keep letting go is shown less; order
 * suggestions follow how much the café actually orders.
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
/** A drawer count off by this much or more, until the café has its own counts to judge by. */
export const WATCH_CASH_GAP: Kurus = 5_000;
/** Earlier drawer counts needed before the café's own differences set the bar. */
export const WATCH_CASH_HISTORY = 10;
/** …and then the bar never goes below this. */
export const WATCH_CASH_GAP_FLOOR: Kurus = 2_000;
/** A bill this many times the supplier's usual is a spike, until the supplier has enough bills to judge by. */
export const WATCH_SPIKE_TIMES = 2;
/** A supplier's latest this many bills make its usual. */
export const WATCH_SPIKE_HISTORY = 12;
/** Earlier bills from one supplier needed before their own spread sets the bar. */
export const WATCH_SPIKE_SPREAD_AFTER = 6;
/** …and then the bar never goes below this many times the usual. */
export const WATCH_SPIKE_FLOOR = 1.5;
/**
 * "Well outside what is usual here": more than the usual plus this many swings, a swing being
 * how far a typical one of the café's own numbers is from its usual.
 */
export const WATCH_SWINGS = 3;
/** "Gördüm" this many times for one kind of finding about one supplier, person or item… */
export const WATCH_LEARN_AFTER = 3;
/** …within this many days… */
export const WATCH_LEARN_DAYS = 90;
/** …and such findings have to be this many times as big to be shown. */
export const WATCH_LEARN_RAISE = 2;
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
/** A bill for an item up to this many days after a suggestion for it is taken as the answer to it. */
export const ORDER_LEARN_WITHIN = 7;
/** Suggestions and bills of the last this many days are compared… */
export const ORDER_LEARN_DAYS = 90;
/** …at least this many times… */
export const ORDER_LEARN_AFTER = 3;
/** …and the café usually orders at least this much more or less than suggested (0.25 = a quarter). */
export const ORDER_LEARN_OFF = 0.25;
/** A learned suggestion stays between half and twice what the rule alone says. */
export const ORDER_LEARN_MIN = 0.5;
export const ORDER_LEARN_MAX = 2;
/** Orders per person per hour when the café has no past shifts to judge by. */
export const STAFFING_DEFAULT_LOAD = 12;
/** An hour is busy at this many times the café's usual orders per person, quiet below this share… */
export const STAFFING_BUSY = 1.6;
export const STAFFING_QUIET = 0.4;
/**
 * …until the café has this many past weekday-hours with people on; then busy is busier than 9
 * in 10 of them, quiet quieter than 9 in 10, but busy is always at least STAFFING_BUSY_FLOOR × usual
 * and quiet at most STAFFING_QUIET_CEILING × usual.
 */
export const STAFFING_SPREAD_AFTER = 20;
export const STAFFING_BUSY_FLOOR = 1.3;
export const STAFFING_QUIET_CEILING = 0.6;
/** …and only when one person has at least this many orders an hour; fewer is never "busy". */
export const STAFFING_BUSY_MIN = 8;
/** Hours with fewer orders than this are left alone. */
export const STAFFING_MIN_ORDERS = 4;

// ─────────────────────────────────────────────── what was seen

/** The kinds of finding that can be let go. */
export type WatchKind = "price" | "cashGap" | "voids" | "billSpike" | "billTwice";

export interface WatchDismissal {
  cafeId: string;
  /** The finding's own key: "cash:<session>", "twice:<bill>:<bill>"… */
  key: string;
  /** What kind of finding it was, and whom it was about: the supplier, the person or the item. */
  kind: WatchKind;
  subject: string | null;
  memberId: string;
  note: string | null;
  at: Date;
}

/** A suggested order amount as Gözcü showed it on a day (C15), to compare with the bills that follow. */
export interface WatchSuggestion {
  cafeId: string;
  itemId: string;
  day: string;
  /** What the rule alone said, before anything learned from earlier orders. */
  orderMilli: number;
}

export interface WatchStore {
  listDismissed(cafeId: string): Promise<WatchDismissal[]>;
  /** Marks it seen; a second time keeps the first. */
  dismiss(d: WatchDismissal): Promise<void>;
  undismiss(cafeId: string, key: string): Promise<void>;
  /** Keeps the day's latest suggestion per item. */
  noteSuggestions(cafeId: string, day: string, lines: readonly { itemId: string; orderMilli: number }[]): Promise<void>;
  listSuggestions(cafeId: string, since: string): Promise<WatchSuggestion[]>;
}

export class InMemoryWatchStore implements WatchStore {
  private readonly seen = new Map<string, WatchDismissal>();
  private readonly suggested = new Map<string, WatchSuggestion>();

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
  async noteSuggestions(cafeId: string, day: string, lines: readonly { itemId: string; orderMilli: number }[]) {
    for (const l of lines) this.suggested.set(`${cafeId}:${l.itemId}:${day}`, { cafeId, itemId: l.itemId, day, orderMilli: l.orderMilli });
  }
  async listSuggestions(cafeId: string, since: string) {
    return [...this.suggested.values()]
      .filter((s) => s.cafeId === cafeId && s.day >= since)
      .sort((a, b) => a.day.localeCompare(b.day) || a.itemId.localeCompare(b.itemId))
      .map((s) => ({ ...s }));
  }
}

// ─────────────────────────────────────────────── what is usual here

/** The middle one: as many above it as below. */
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** How far a typical one is from the usual: the middle of the distances. */
export function swing(xs: readonly number[], usual = median(xs)): number {
  return median(xs.map((x) => Math.abs(x - usual)));
}

/** The value `share` of them are at or below (0.9: nine in ten). */
export function percentile(xs: readonly number[], share: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(share * s.length) - 1))]!;
}

// ─────────────────────────────────────────────── learning from "Gördüm"

const letGoKey = (kind: WatchKind, subject: string | null) => `${kind}:${subject ?? ""}`;

/**
 * How many times the owner let each kind of finding go lately, per supplier, person or item.
 * Ask it with `of(kind, subject)`.
 */
export function letGoCounts(dismissals: readonly Pick<WatchDismissal, "kind" | "subject" | "at">[], now: Date): (kind: WatchKind, subject: string | null) => number {
  const since = now.getTime() - WATCH_LEARN_DAYS * 86_400_000;
  const counts = new Map<string, number>();
  for (const d of dismissals) {
    if (d.at.getTime() < since || d.at.getTime() > now.getTime()) continue;
    const k = letGoKey(d.kind, d.subject);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return (kind, subject) => counts.get(letGoKey(kind, subject)) ?? 0;
}

export interface Verdict {
  /** Worth showing. */
  show: boolean;
  /** Over the café's own bar, but under the bar the owner's "Gördüm"s raised: left out, and counted. */
  quiet: boolean;
  /** The bar it was judged by. */
  limit: number;
  /** How many such the owner let go lately when that raised the bar; 0 when it didn't. */
  letGo: number;
}

/**
 * A number against the café's bar for it. Once the owner has let WATCH_LEARN_AFTER such go in
 * WATCH_LEARN_DAYS, the bar is WATCH_LEARN_RAISE times higher.
 */
export function judge(value: number, limit: number, letGo: number): Verdict {
  const raised = letGo >= WATCH_LEARN_AFTER;
  const bar = raised ? limit * WATCH_LEARN_RAISE : limit;
  return { show: value >= bar, quiet: value >= limit && value < bar, limit: bar, letGo: raised ? letGo : 0 };
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
  /** The count that is out of the ordinary for them. */
  limit: number;
  /** Times the owner let this person's voids go lately, when that raised the bar; else 0. */
  letGo: number;
  /** Over their own bar but under the one the owner's "Gördüm"s raised: not shown. */
  quiet: boolean;
  orderIds: string[];
}

/**
 * The number of voids and refunds in a week that is out of the ordinary for one person, from
 * their weeks before: at least WATCH_VOIDS_MIN and twice their usual, and when their weeks
 * vary, more than the usual plus WATCH_SWINGS swings.
 */
export function voidsLimit(weeks: readonly number[]): number {
  const usual = weeks.length ? weeks.reduce((s, w) => s + w, 0) / weeks.length : 0;
  return Math.max(WATCH_VOIDS_MIN, 2 * usual, usual + WATCH_SWINGS * swing(weeks, usual));
}

/**
 * People who voided or refunded more than they usually do this week, against their own last
 * WATCH_BASELINE_WEEKS weeks (voidsLimit). `letGo` says how often the owner let a person's
 * voids go lately.
 */
export function unusualVoids(
  orders: readonly Pick<Order, "id" | "voidedAt" | "voidedByMemberId" | "refundedAt" | "refundedByMemberId">[],
  now: Date,
  letGo: (memberId: string) => number = () => 0,
): VoidsByPerson[] {
  const week = 7 * 86_400_000;
  const weekAgo = now.getTime() - WATCH_DAYS * 86_400_000;
  const since = weekAgo - WATCH_BASELINE_WEEKS * week;
  const by = new Map<string, { now: string[]; weeks: number[] }>();
  for (const o of orders)
    for (const [at, who] of [
      [o.voidedAt, o.voidedByMemberId],
      [o.refundedAt, o.refundedByMemberId],
    ] as const) {
      if (!at || !who || at.getTime() < since || at.getTime() > now.getTime()) continue;
      const row = by.get(who) ?? { now: [], weeks: Array<number>(WATCH_BASELINE_WEEKS).fill(0) };
      if (at.getTime() >= weekAgo) row.now.push(o.id);
      else row.weeks[Math.min(WATCH_BASELINE_WEEKS - 1, Math.floor((weekAgo - at.getTime()) / week))]!++;
      by.set(who, row);
    }
  const out: VoidsByPerson[] = [];
  for (const [memberId, r] of by) {
    const usual = r.weeks.reduce((s, w) => s + w, 0) / WATCH_BASELINE_WEEKS;
    const v = judge(r.now.length, voidsLimit(r.weeks), letGo(memberId));
    if (v.show || v.quiet)
      out.push({ memberId, count: r.now.length, usual: Math.round(usual * 10) / 10, limit: Math.ceil(v.limit), letGo: v.letGo, quiet: v.quiet, orderIds: r.now });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * How far off a drawer count has to be to be out of the ordinary here, from the café's earlier
 * counts: WATCH_CASH_GAP until there are WATCH_CASH_HISTORY of them, then the usual difference
 * plus WATCH_SWINGS swings, never under WATCH_CASH_GAP_FLOOR.
 */
export function cashGapLimit(earlierDifferences: readonly Kurus[]): Kurus {
  if (earlierDifferences.length < WATCH_CASH_HISTORY) return WATCH_CASH_GAP;
  const off = earlierDifferences.map(Math.abs);
  const usual = median(off);
  return Math.max(WATCH_CASH_GAP_FLOOR, Math.round(usual + WATCH_SWINGS * swing(off, usual)));
}

type B = Pick<Bill, "id" | "supplierId" | "date" | "totalKurus" | "voidedAt">;

/**
 * A supplier's usual bill (the middle of its latest WATCH_SPIKE_HISTORY) and the total that is
 * well above it: twice the usual while it has fewer than WATCH_SPIKE_SPREAD_AFTER bills, then
 * the usual plus WATCH_SWINGS swings, never under WATCH_SPIKE_FLOOR × usual. Null under three.
 */
export function spikeLimit(earlierTotals: readonly Kurus[]): { usualKurus: Kurus; limitKurus: Kurus } | null {
  if (earlierTotals.length < 3) return null;
  const usual = Math.round(median(earlierTotals));
  const limit =
    earlierTotals.length < WATCH_SPIKE_SPREAD_AFTER
      ? WATCH_SPIKE_TIMES * usual
      : Math.max(WATCH_SPIKE_FLOOR * usual, usual + WATCH_SWINGS * swing(earlierTotals, usual));
  return { usualKurus: usual, limitKurus: Math.round(limit) };
}

export interface BillSpike {
  billId: string;
  supplierId: string;
  usualKurus: Kurus;
  limitKurus: Kurus;
  letGo: number;
  quiet: boolean;
}

/** Bills well above what the same supplier usually sends (spikeLimit). */
export function billSpikes(bills: readonly B[], from: string, letGo: (supplierId: string) => number = () => 0): BillSpike[] {
  const out: BillSpike[] = [];
  const live = bills.filter((b) => !b.voidedAt && b.supplierId);
  for (const b of live) {
    if (b.date < from) continue;
    const before = live
      .filter((x) => x.supplierId === b.supplierId && x.id !== b.id && x.date < b.date)
      .sort((x, y) => y.date.localeCompare(x.date))
      .slice(0, WATCH_SPIKE_HISTORY)
      .map((x) => x.totalKurus);
    const bar = spikeLimit(before);
    if (!bar || bar.usualKurus <= 0) continue;
    const v = judge(b.totalKurus, bar.limitKurus, letGo(b.supplierId!));
    if (v.show || v.quiet) out.push({ billId: b.id, supplierId: b.supplierId!, usualKurus: bar.usualKurus, limitKurus: v.limit, letGo: v.letGo, quiet: v.quiet });
  }
  return out;
}

/**
 * Two bills from one supplier for the same amount within WATCH_TWICE_DAYS: maybe one bill
 * entered twice. For a supplier the owner keeps letting such pairs go, only within half that.
 */
export function twiceBills(
  bills: readonly B[],
  from: string,
  letGo: (supplierId: string) => number = () => 0,
): { billIds: [string, string]; supplierId: string; letGo: number; quiet: boolean }[] {
  const live = bills.filter((b) => !b.voidedAt && b.supplierId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: { billIds: [string, string]; supplierId: string; letGo: number; quiet: boolean }[] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (b.date > plusDays(a.date, WATCH_TWICE_DAYS)) break;
      if (b.date < from || a.supplierId !== b.supplierId || a.totalKurus !== b.totalKurus) continue;
      const n = letGo(a.supplierId!);
      const raised = n >= WATCH_LEARN_AFTER;
      const quiet = raised && daysBetween(a.date, b.date) > WATCH_TWICE_DAYS / WATCH_LEARN_RAISE;
      out.push({ billIds: [a.id, b.id], supplierId: a.supplierId!, letGo: raised ? n : 0, quiet });
    }
  return out;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

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

export interface OrderHabit {
  /** Bills that answered a suggestion. */
  times: number;
  /** What the café ordered over what was suggested, the middle of those times: 1.5 is half as much again. */
  ratio: number;
}

/**
 * How this café answers Penny's order suggestions, item by item. A bill for an item within
 * ORDER_LEARN_WITHIN days of a suggestion for it answers the latest suggestion before it (one
 * not already answered by an earlier bill). With at least ORDER_LEARN_AFTER answers in the
 * last ORDER_LEARN_DAYS whose middle is ORDER_LEARN_OFF or more above or below what was
 * suggested, the item has a habit; the ratio is kept between ORDER_LEARN_MIN and ORDER_LEARN_MAX.
 */
export function orderHabits(
  suggested: readonly Pick<WatchSuggestion, "itemId" | "day" | "orderMilli">[],
  bought: readonly { itemId: string; date: string; qtyMilli: number }[],
  today: string,
): Map<string, OrderHabit> {
  const since = plusDays(today, -ORDER_LEARN_DAYS);
  const items = new Map<string, { s: { day: string; orderMilli: number }[]; b: Map<string, number> }>();
  const of = (id: string) => items.get(id) ?? items.set(id, { s: [], b: new Map() }).get(id)!;
  for (const x of suggested) if (x.day >= since && x.day <= today && x.orderMilli > 0) of(x.itemId).s.push(x);
  for (const x of bought) if (x.date >= since && x.date <= today && x.qtyMilli > 0) of(x.itemId).b.set(x.date, (of(x.itemId).b.get(x.date) ?? 0) + x.qtyMilli);
  const out = new Map<string, OrderHabit>();
  for (const [itemId, { s, b }] of items) {
    const ratios: number[] = [];
    let after = "";
    for (const [date, qty] of [...b].sort(([x], [y]) => x.localeCompare(y))) {
      const answered = s.filter((x) => x.day > after && x.day <= date && x.day >= plusDays(date, -ORDER_LEARN_WITHIN)).at(-1);
      if (answered) ratios.push(qty / answered.orderMilli);
      after = date;
    }
    if (ratios.length < ORDER_LEARN_AFTER) continue;
    const r = median(ratios);
    if (r < 1 + ORDER_LEARN_OFF && r > 1 / (1 + ORDER_LEARN_OFF)) continue;
    out.set(itemId, { times: ratios.length, ratio: Math.round(Math.min(ORDER_LEARN_MAX, Math.max(ORDER_LEARN_MIN, r)) * 100) / 100 });
  }
  return out;
}

/** The rule's order amount as this café usually takes it, to the nearest whole unit. */
export function learnedOrder(orderMilli: number, habit: OrderHabit | undefined): number {
  return habit ? Math.max(MILLI, Math.round((orderMilli * habit.ratio) / MILLI) * MILLI) : orderMilli;
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

/** Orders an hour for one person that count as busy, and as quiet, in this café. */
export interface StaffingBars {
  busyAt: number;
  quietAt: number;
}

/**
 * Busy and quiet for this café. With fewer than STAFFING_SPREAD_AFTER past weekday-hours to go
 * by: STAFFING_BUSY and STAFFING_QUIET times the usual load. With more: busier than 9 in 10 of
 * them (at least STAFFING_BUSY_FLOOR × usual), quieter than 9 in 10 (at most
 * STAFFING_QUIET_CEILING × usual). Busy is never under STAFFING_BUSY_MIN.
 */
export function staffingBars(pastLoads: readonly number[], usualLoad: number): StaffingBars {
  const round = (x: number) => Math.round(x * 10) / 10;
  if (pastLoads.length < STAFFING_SPREAD_AFTER) return { busyAt: round(Math.max(STAFFING_BUSY_MIN, STAFFING_BUSY * usualLoad)), quietAt: round(STAFFING_QUIET * usualLoad) };
  return {
    busyAt: round(Math.max(STAFFING_BUSY_MIN, STAFFING_BUSY_FLOOR * usualLoad, percentile(pastLoads, 0.9))),
    quietAt: round(Math.min(STAFFING_QUIET_CEILING * usualLoad, percentile(pastLoads, 0.1))),
  };
}

/**
 * Hours that look short- or over-staffed against the café's own busy and quiet (staffingBars),
 * joined into runs: "Pazar 14:00–17:00, saatte 9 sipariş, 1 kişi".
 */
export function staffingHints(slots: readonly StaffingSlot[], bars: StaffingBars): StaffingHint[] {
  const kindOf = (s: StaffingSlot): StaffingHint["kind"] | null => {
    if (s.orders < STAFFING_MIN_ORDERS) return null;
    if (s.people === 0) return "nobody";
    const load = s.orders / s.people;
    if (load >= bars.busyAt) return "busy";
    if (s.people >= 2 && load <= bars.quietAt) return "quiet";
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
