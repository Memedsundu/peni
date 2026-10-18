import type { ExpenseKindDTO, ReportProductDTO, ReportTotalsDTO, SalesReportDTO, TodaySalesDTO } from "@peni/api";
import {
  addMonths,
  bucketOf,
  bucketsOf,
  daysBetween,
  dayPay,
  lineTotal,
  localDateKey,
  monthsBetween,
  plusDays,
  previousRange,
  rateOn,
  recipeCost,
  reportStep,
  REPORT_MAX_DAYS,
  startOfLocalDay,
  validDay,
  weekdayOf,
  type BillStore,
  type MenuStore,
  type OrderStore,
  type Payment,
  type PaymentStore,
  type PeniDirectory,
  type ShiftStore,
  type StockStore,
} from "@peni/core";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

const ALL = 100_000;
const MONTHS = 12;
const EXPENSE_ORDER: ExpenseKindDTO[] = ["ingredients", "supplies", "wages", "rent", "utilities", "services", "other"];

/** "Askıya bırak" lines: money in for a coffee someone else drinks later, not a product sold now. */
const isHang = (productId: string) => productId.startsWith("askida:");

/**
 * Raporlar (plan piece 23). Shelby split its reports into a daily tab and an analytics tab
 * that disagreed with its Panel; here one page answers "how are we doing" for any period:
 * money in, what was spent, what was left, when it sold, and which products earn the most.
 *
 * Money in is cash and card, refunds out, the same as Ay kapanışı. Spending is what bills
 * say for those days plus pay for the hours worked, so a big delivery shows in the month it
 * came. Each product's profit uses its recipe at the latest bill prices (D30), the same
 * figure as on its Menü page.
 */
export class SalesReportService {
  constructor(
    private readonly orders: OrderStore,
    private readonly payments: PaymentStore,
    private readonly bills: BillStore,
    private readonly shifts: ShiftStore,
    private readonly stock: StockStore,
    private readonly menu: MenuStore,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

  async get(ctx: StaffContext, range?: { from?: string; through?: string }): Promise<SalesReportDTO> {
    this.require(ctx);
    const cafeId = ctx.cafe.id;
    const tz = await this.timeZone(cafeId);
    const today = localDateKey(this.now(), tz);
    const from = range?.from ?? `${today.slice(0, 7)}-01`;
    const through = range?.through ?? today;
    if (!validDay(from) || !validDay(through) || from > through || through > today || daysBetween(from, through) > REPORT_MAX_DAYS)
      throw new AppError("REPORT_RANGE", "Pick days from the past, start before end, at most 400 days", 400);
    const previous = previousRange(from, through);
    const firstMonth = addMonths(today.slice(0, 7), -(MONTHS - 1));
    const earliest = [previous.from, `${firstMonth}-01`].sort()[0]!;

    const [payments, orders, bills, workDays, rates, recipes, items, products] = await Promise.all([
      this.payments.listSettled(cafeId, this.dayStart(earliest, tz), this.dayStart(plusDays(today, 1), tz)),
      this.orders.listOrders(cafeId, { from: previous.from, through, status: "paid", limit: ALL }),
      this.bills.listBills(cafeId, { from: earliest }),
      this.shifts.listWorkDays(cafeId, earliest, today),
      this.shifts.listRates(cafeId),
      this.stock.listRecipes(cafeId),
      this.stock.listItems(cafeId, { includeArchived: true }),
      this.menu.listMenu(cafeId),
    ]);
    const money = payments.filter((p) => p.method === "cash" || p.method === "card");
    const dayOf = (p: Payment) => localDateKey(p.settledAt!, tz);
    const signed = (p: Payment) => (p.kind === "sale" ? p.amountKurus : -p.amountKurus);
    const liveBills = bills.filter((b) => !b.voidedAt);

    // Money in, bills and pay, day by day.
    const salesByDay = new Map<string, number>();
    for (const p of money) add(salesByDay, dayOf(p), signed(p));
    const spentByDay = new Map<string, number>();
    const spentByKind = (f: string, t: string) => {
      const out = new Map<ExpenseKindDTO, number>();
      for (const b of liveBills) if (b.date >= f && b.date <= t) for (const l of b.lines) add(out, l.category, l.totalKurus);
      for (const d of workDays) if (d.day >= f && d.day <= t) add(out, "wages", dayPay(d.minutes, rateOn(rates, d.memberId, d.day)));
      return out;
    };
    for (const b of liveBills) add(spentByDay, b.date, b.totalKurus);
    for (const d of workDays) add(spentByDay, d.day, dayPay(d.minutes, rateOn(rates, d.memberId, d.day)));
    const sum = (m: Map<string, number>, f: string, t: string) => [...m].reduce((s, [d, k]) => (d >= f && d <= t ? s + k : s), 0);

    // A period that runs to today has a half-done last day, so the period before is cut at
    // the same time of day; otherwise "today" always looks like a bad day.
    const sinceMidnight = this.now().getTime() - this.dayStart(today, tz).getTime();
    const cutoff = through === today ? new Date(this.dayStart(previous.through, tz).getTime() + sinceMidnight) : null;
    const late = (day: string, at: Date) => cutoff !== null && day === previous.through && at > cutoff;
    const lateSales = money.filter((p) => late(dayOf(p), p.settledAt!)).reduce((s, p) => s + signed(p), 0);

    const totals = (f: string, t: string): ReportTotalsDTO => {
      const these = orders.filter((o) => o.businessDay >= f && o.businessDay <= t && !late(o.businessDay, o.paidAt ?? o.createdAt));
      const salesKurus = sum(salesByDay, f, t) - (f <= previous.through && previous.through <= t ? lateSales : 0);
      const expensesKurus = sum(spentByDay, f, t);
      return {
        salesKurus,
        orders: these.length,
        avgOrderKurus: these.length ? Math.round(these.reduce((s, o) => s + o.totalKurus, 0) / these.length) : null,
        expensesKurus,
        profitKurus: salesKurus - expensesKurus,
      };
    };

    // The sales chart, with the previous period's bucket at the same place.
    const step = reportStep(from, through);
    const hourly = (day: string) => {
      const m = new Map<string, number>();
      for (const p of money) if (dayOf(p) === day) add(m, localHour(p.settledAt!, tz), signed(p));
      return m;
    };
    const bucketed = (f: string, t: string) => {
      if (step === "hour") return hourly(f);
      const m = new Map<string, number>();
      for (const [d, k] of salesByDay) if (d >= f && d <= t) add(m, bucketOf(d, step), k);
      return m;
    };
    const keys = bucketsOf(from, through, step);
    const prevKeys = bucketsOf(previous.from, previous.through, step);
    const now = bucketed(from, through);
    const before = bucketed(previous.from, previous.through);
    const points = keys.map((key, i) => ({
      key,
      salesKurus: now.get(key) ?? 0,
      previousKurus: prevKeys[i] === undefined ? null : (before.get(prevKeys[i]!) ?? 0),
    }));
    const series = { step, points: step === "hour" ? trimHours(points) : points };

    // When it sells.
    const inPeriod = orders.filter((o) => o.businessDay >= from && o.businessDay <= through);
    const byHour = new Map<string, number>();
    for (const o of inPeriod) add(byHour, localHour(o.paidAt ?? o.createdAt, tz), 1);
    const hours = [...byHour].sort(([a], [b]) => a.localeCompare(b)).map(([hour, n]) => ({ hour, orders: n }));
    const weekdays: SalesReportDTO["weekdays"] = [];
    // Whole days only: today isn't over.
    const lastWhole = through < today ? through : plusDays(today, -1);
    if (daysBetween(from, through) >= 7 && lastWhole >= from) {
      const totalsBy = new Map<number, { kurus: number; days: number }>();
      for (let d = from; d <= lastWhole; d = plusDays(d, 1)) {
        const w = totalsBy.get(weekdayOf(d)) ?? { kurus: 0, days: 0 };
        totalsBy.set(weekdayOf(d), { kurus: w.kurus + (salesByDay.get(d) ?? 0), days: w.days + 1 });
      }
      for (let w = 1; w <= 7; w++) {
        const x = totalsBy.get(w);
        if (x) weekdays.push({ weekday: w, avgKurus: Math.round(x.kurus / x.days) });
      }
    }

    // How it was paid.
    const inRange = payments.filter((p) => dayOf(p) >= from && dayOf(p) <= through);
    const net = (method: Payment["method"]) => inRange.filter((p) => p.method === method).reduce((s, p) => s + signed(p), 0);

    // Products, best profit first.
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const recipeMap = new Map(recipes.map((r) => [r.productId, r]));
    const names = new Map(products.map((p) => [p.productId, p.name]));
    const rows = new Map<string, { name: string; quantity: number; salesKurus: number }>();
    for (const o of inPeriod)
      for (const l of o.lines) {
        if (isHang(l.productId)) continue;
        const row = rows.get(l.productId) ?? { name: names.get(l.productId) ?? l.name, quantity: 0, salesKurus: 0 };
        row.quantity += l.quantity;
        row.salesKurus += Math.round((lineTotal(l) * (100 - o.discountPercent)) / 100);
        rows.set(l.productId, row);
      }
    const ranked: ReportProductDTO[] = [...rows].map(([productId, r]) => {
      const unitCostKurus = recipeCost(recipeMap.get(productId) ?? null, itemMap);
      const profitKurus = unitCostKurus === null ? null : r.salesKurus - unitCostKurus * r.quantity;
      return {
        productId,
        ...r,
        unitCostKurus,
        profitKurus,
        marginPercent: profitKurus === null || r.salesKurus <= 0 ? null : Math.round((profitKurus / r.salesKurus) * 100),
      };
    });
    ranked.sort((a, b) =>
      a.profitKurus === null || b.profitKurus === null
        ? Number(a.profitKurus === null) - Number(b.profitKurus === null) || b.salesKurus - a.salesKurus
        : b.profitKurus - a.profitKurus || b.salesKurus - a.salesKurus,
    );

    // Month by month, from the first with numbers.
    const thisMonth = today.slice(0, 7);
    const monthOf = (m: Map<string, number>, month: string) => sum(m, `${month}-01`, `${month}-31`);
    const months = monthsBetween(firstMonth, thisMonth)
      .map((month) => {
        const salesKurus = monthOf(salesByDay, month);
        const expensesKurus = monthOf(spentByDay, month);
        return { month, salesKurus, expensesKurus, profitKurus: salesKurus - expensesKurus };
      })
      .filter((m, i, all) => all.slice(0, i + 1).some((x) => x.salesKurus || x.expensesKurus));

    const kinds = spentByKind(from, through);
    return {
      cafe: { slug: ctx.cafe.slug, name: ctx.cafe.name },
      today,
      from,
      through,
      previous: { ...previous, untilTime: cutoff ? localTime(cutoff, tz) : null },
      totals: totals(from, through),
      previousTotals: totals(previous.from, previous.through),
      paidWith: { cashKurus: net("cash"), cardKurus: net("card"), peniKurus: net("peni"), askidaKurus: net("askida") },
      series,
      hours,
      weekdays,
      expenses: EXPENSE_ORDER.map((kind) => ({ kind, kurus: kinds.get(kind) ?? 0 }))
        .filter((e) => e.kurus !== 0)
        .sort((a, b) => b.kurus - a.kurus),
      products: ranked,
      unpriced: ranked.filter((r) => r.unitCostKurus === null).length,
      months,
    };
  }

  /** Bugün's sales strip: today by hour against the same weekday last week, up to the same time. */
  async today(ctx: StaffContext): Promise<TodaySalesDTO | null> {
    if (!ctx.permissions.has("reports.view")) return null;
    const cafeId = ctx.cafe.id;
    const tz = await this.timeZone(cafeId);
    const now = this.now();
    const today = localDateKey(now, tz);
    const lastWeekDay = plusDays(today, -7);
    const [payments, orders] = await Promise.all([
      this.payments.listSettled(cafeId, this.dayStart(lastWeekDay, tz), this.dayStart(plusDays(today, 1), tz)),
      this.orders.listOrders(cafeId, { businessDay: today, status: "paid", limit: ALL }),
    ]);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const money = payments.filter((p) => p.method === "cash" || p.method === "card");
    const signed = (p: Payment) => (p.kind === "sale" ? p.amountKurus : -p.amountKurus);
    const now_ = new Map<string, number>();
    const then = new Map<string, number>();
    let salesKurus = 0;
    let lastWeekKurus = 0;
    for (const p of money) {
      const day = localDateKey(p.settledAt!, tz);
      if (day === today) {
        add(now_, localHour(p.settledAt!, tz), signed(p));
        salesKurus += signed(p);
      } else if (day === lastWeekDay) {
        add(then, localHour(p.settledAt!, tz), signed(p));
        if (p.settledAt! <= weekAgo) lastWeekKurus += signed(p);
      }
    }
    const used = [...now_.keys(), ...then.keys()].sort();
    const hours: TodaySalesDTO["hours"] = [];
    if (used.length)
      for (let h = Number(used[0]); h <= Number(used[used.length - 1]); h++) {
        const hour = String(h).padStart(2, "0");
        hours.push({ hour, salesKurus: now_.get(hour) ?? 0, lastWeekKurus: then.get(hour) ?? 0 });
      }
    return { salesKurus, orders: orders.length, lastWeekKurus, lastWeekDay, hours };
  }

  private require(ctx: StaffContext): void {
    if (ctx.permissions.has("reports.view")) return;
    if (ctx.rolePermissions.has("reports.view")) throw new AppError("NEEDS_PASSWORD", "Sign in with your password to see reports", 403);
    throw new AppError("FORBIDDEN", "Your role can't see reports", 403);
  }

  private async timeZone(cafeId: string): Promise<string> {
    return (await this.directory.getSettings(cafeId)).timeZone;
  }

  private dayStart(day: string, tz: string): Date {
    return startOfLocalDay(new Date(`${day}T12:00:00Z`), tz);
  }
}

function add<K>(m: Map<K, number>, key: K, n: number): void {
  m.set(key, (m.get(key) ?? 0) + n);
}

function localTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
}

function localHour(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at);
}

/** Only the hours the café was selling on either day. */
function trimHours<T extends { salesKurus: number; previousKurus: number | null }>(points: T[]): T[] {
  const used = points.map((p, i) => (p.salesKurus || p.previousKurus ? i : -1)).filter((i) => i >= 0);
  return used.length ? points.slice(used[0], used[used.length - 1]! + 1) : [];
}
