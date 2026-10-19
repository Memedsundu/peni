import type { ForecastDTO, ForecastEventDTO, OrderSuggestionDTO, StaffingDTO, WatchDTO, WatchPriceDTO, WatchUnusualDTO } from "@peni/api";
import {
  billSpikes,
  costOn,
  forecast,
  FORECAST_DAYS,
  FORECAST_HISTORY_DAYS,
  localDateKey,
  marginPct,
  MILLI,
  orderAmount,
  owedByMonth,
  plusDays,
  priceChanges,
  priceForMargin,
  rateOn,
  recipeCost,
  STAFFING_DEFAULT_LOAD,
  staffingHints,
  startOfLocalDay,
  twiceBills,
  unusualVoids,
  WATCH_BASELINE_WEEKS,
  WATCH_CASH_GAP,
  WATCH_DAYS,
  WATCH_MARGIN_DROP,
  WATCH_PRICE_DAYS,
  weekdayOf,
  weekStartOf,
  type BillCategory,
  type BillStore,
  type CashStore,
  type ForecastEvent,
  type MenuStore,
  type OrderStore,
  type PaymentStore,
  type PeniDirectory,
  type Permission,
  type ShiftStore,
  type StaffStore,
  type StaffingSlot,
  type StockStore,
  type WatchStore,
} from "@peni/core";
import type { DebtService } from "./debts";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { StaffContext } from "./staff";

const ALL = 100_000;
/** Bills of these kinds come once a month; the forecast expects them again a month on. */
const MONTHLY: BillCategory[] = ["rent", "utilities"];
/** Everyday buying, as the forecast counts it: everything but the monthly kinds and pay. */
const EVERYDAY: BillCategory[] = ["ingredients", "supplies", "services", "other"];
/** Pay for a month's hours goes out on this day of the next month. */
export const PAY_DAY = 5;
const UNIT_WORD = { kg: "kg", l: "L", adet: "adet" } as const;

export interface WatchDeps {
  store: WatchStore;
  bills: BillStore;
  stock: StockStore;
  menu: MenuStore;
  orders: OrderStore;
  payments: PaymentStore;
  cash: CashStore;
  shifts: ShiftStore;
  staff: StaffStore;
  debts: DebtService;
  money: MoneyService;
  directory: PeniDirectory;
  now: () => Date;
}

/**
 * Gözcü (plan piece 31). Five ways of keeping an eye out, each from the café's own records:
 * prices bills brought and what they did to margins (C12), activity out of the ordinary
 * (C13), the next 30 days of money (C14), what to order (C15), and hours in the week's plan
 * that look short or over-staffed (C16). No assistant is needed. Prices and unusual findings
 * can be let go ("Gördüm") and stay hidden for everyone.
 */
export class WatchService {
  constructor(private readonly d: WatchDeps) {}

  async get(ctx: StaffContext): Promise<WatchDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see Gözcü", 403);
    const p = ctx.permissions;
    const cafeId = ctx.cafe.id;
    const [today, seen] = await Promise.all([this.today(cafeId), this.d.store.listDismissed(cafeId)]);
    const hidden = new Set(seen.map((s) => s.key));
    const [prices, unusual, forecastDto, orders, staffing] = await Promise.all([
      this.prices(cafeId, today),
      this.unusual(cafeId, today),
      p.has("cash.manage") && p.has("debts.view") ? this.forecast(ctx, today) : null,
      p.has("stock.view") ? this.orderSuggestions(ctx, today) : null,
      p.has("shifts.view") ? this.staffing(cafeId, today) : null,
    ]);
    return {
      today,
      prices: prices.filter((x) => !hidden.has(x.key)),
      unusual: unusual.filter((x) => !hidden.has(x.key)),
      seen: [...prices, ...unusual].filter((x) => hidden.has(x.key)).length,
      forecast: forecastDto,
      orders,
      staffing,
    };
  }

  /** "Gördüm": a price or an unusual finding is let go for everyone. */
  async dismiss(ctx: StaffContext, input: { key: string; note?: string | null }): Promise<WatchDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see Gözcü", 403);
    const today = await this.today(ctx.cafe.id);
    const [prices, unusual] = await Promise.all([this.prices(ctx.cafe.id, today), this.unusual(ctx.cafe.id, today)]);
    if (![...prices, ...unusual].some((x) => x.key === input.key)) throw new AppError("WATCH_KEY", "No such finding now", 404);
    await this.d.store.dismiss({
      cafeId: ctx.cafe.id,
      key: input.key,
      memberId: ctx.member.id,
      note: input.note?.trim().slice(0, 200) || null,
      at: this.d.now(),
    });
    return this.get(ctx);
  }

  /** Bugün's cards: how many findings wait, and the day money may run short. */
  async attention(
    cafeId: string,
    permissions: ReadonlySet<Permission>,
  ): Promise<{ count: number; names: string[]; short: { day: string; balanceKurus: number } | null }> {
    if (!permissions.has("reports.view")) return { count: 0, names: [], short: null };
    const today = await this.today(cafeId);
    const [seen, prices, unusual] = await Promise.all([this.d.store.listDismissed(cafeId), this.prices(cafeId, today), this.unusual(cafeId, today)]);
    const hidden = new Set(seen.map((s) => s.key));
    const open = [
      ...unusual.filter((x) => !hidden.has(x.key)).map((x) => x.name ?? x.kind),
      ...prices.filter((x) => !hidden.has(x.key) && x.products.some((p) => p.suggestedKurus !== null)).map((x) => x.item),
    ];
    let short: { day: string; balanceKurus: number } | null = null;
    if (permissions.has("cash.manage") && permissions.has("debts.view")) {
      const f = await this.forecastFor(cafeId, permissions, today);
      // Only when it is near enough to act on.
      if (f.shortfall && f.startKurus !== null && f.shortfall.day <= plusDays(today, 14)) short = f.shortfall;
    }
    return { count: open.length, names: open, short };
  }

  // ─────────────────────────────────────────── C12: prices

  private async prices(cafeId: string, today: string): Promise<WatchPriceDTO[]> {
    const from = plusDays(today, -WATCH_PRICE_DAYS + 1);
    const [bills, items, recipes, menu, suppliers] = await Promise.all([
      this.d.bills.listBills(cafeId, { from: plusDays(today, -365), to: today }),
      this.d.stock.listItems(cafeId, { includeArchived: true }),
      this.d.stock.listRecipes(cafeId),
      this.d.menu.listMenu(cafeId),
      this.d.bills.listSuppliers(cafeId, { includeArchived: true }),
    ]);
    const prices = new Map(menu.map((m) => [m.productId, m.priceKurus]));
    const names = new Map(menu.map((m) => [m.productId, m.name]));
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const itemById = new Map(items.map((i) => [i.id, i]));
    const before = new Map(items.map((i) => [i.id, { costKurus: costOn(i.id, plusDays(from, -1), bills, i.costKurus).costKurus }]));
    const now = new Map(items.map((i) => [i.id, { costKurus: costOn(i.id, today, bills, i.costKurus).costKurus }]));
    return priceChanges({ from, through: today, bills, items, recipes, prices }).map((c) => {
      const item = itemById.get(c.itemId)!;
      const products = recipes
        .filter((r) => prices.has(r.productId) && r.lines.some((l) => l.itemId === c.itemId))
        .flatMap((r) => {
          const price = prices.get(r.productId)!;
          const costBefore = recipeCost(r, before);
          const costNow = recipeCost(r, now);
          if (costBefore === null || costNow === null) return [];
          const mb = marginPct(price, costBefore);
          const mn = marginPct(price, costNow);
          const keep = priceForMargin(costNow, mb);
          return [
            {
              productId: r.productId,
              name: names.get(r.productId) ?? r.productId,
              priceKurus: price,
              costBeforeKurus: costBefore,
              costNowKurus: costNow,
              marginBeforePct: mb,
              marginNowPct: mn,
              suggestedKurus: mb - mn >= WATCH_MARGIN_DROP && keep !== null && keep > price ? keep : null,
            },
          ];
        })
        .sort((a, b) => b.marginBeforePct - b.marginNowPct - (a.marginBeforePct - a.marginNowPct));
      return {
        key: `price:${c.itemId}:${c.billId}`,
        itemId: c.itemId,
        item: item.name,
        unit: item.unit,
        beforeKurus: c.beforeKurus,
        nowKurus: c.nowKurus,
        changePct: c.changePct,
        billId: c.billId,
        date: c.date,
        supplier: c.supplierId ? (supplierName.get(c.supplierId) ?? null) : null,
        products,
      };
    });
  }

  // ─────────────────────────────────────────── C13: unusual activity

  private async unusual(cafeId: string, today: string): Promise<WatchUnusualDTO[]> {
    const tz = (await this.d.directory.getSettings(cafeId)).timeZone;
    const from = plusDays(today, -WATCH_DAYS + 1);
    const back = plusDays(today, -WATCH_DAYS - WATCH_BASELINE_WEEKS * 7);
    const [orders, sessions, bills, suppliers] = await Promise.all([
      this.d.orders.listOrders(cafeId, { from: back, through: today, limit: ALL }),
      this.d.cash.listSessions(cafeId, 60),
      this.d.bills.listBills(cafeId, { from: plusDays(today, -365), to: today }),
      this.d.bills.listSuppliers(cafeId, { includeArchived: true }),
    ]);
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const billById = new Map(bills.map((b) => [b.id, b]));
    const out: WatchUnusualDTO[] = [];

    for (const s of sessions)
      for (const count of [s.opening, s.closing]) {
        if (!count || count.expectedKurus === null || Math.abs(count.differenceKurus) < WATCH_CASH_GAP) continue;
        const day = localDateKey(count.at, tz);
        if (day < from) continue;
        out.push({
          key: `cash:${s.id}:${count === s.opening ? "open" : "close"}`,
          kind: "cashGap",
          day,
          amountKurus: count.differenceKurus,
          usual: null,
          count: null,
          name: (await this.names([count.byMemberId])).get(count.byMemberId) ?? null,
          note: count.note,
          href: "/panel/nakit",
        });
      }

    const voids = unusualVoids(orders, this.d.now());
    const voidNames = await this.names(voids.map((v) => v.memberId));
    for (const v of voids)
      out.push({
        key: `voids:${v.memberId}:${weekStartOf(today)}`,
        kind: "voids",
        day: today,
        amountKurus: null,
        usual: v.usual,
        count: v.count,
        name: voidNames.get(v.memberId) ?? null,
        note: null,
        href: "/kasa",
      });

    for (const s of billSpikes(bills, from)) {
      const b = billById.get(s.billId)!;
      out.push({
        key: `spike:${b.id}`,
        kind: "billSpike",
        day: b.date,
        amountKurus: b.totalKurus,
        usual: s.usualKurus,
        count: null,
        name: b.supplierId ? (supplierName.get(b.supplierId) ?? null) : null,
        note: null,
        href: `/panel/faturalar?fatura=${encodeURIComponent(b.id)}`,
      });
    }

    for (const [a, b] of twiceBills(bills, from)) {
      const second = billById.get(b)!;
      out.push({
        key: `twice:${a}:${b}`,
        kind: "billTwice",
        day: second.date,
        amountKurus: second.totalKurus,
        usual: null,
        count: 2,
        name: second.supplierId ? (supplierName.get(second.supplierId) ?? null) : null,
        note: null,
        href: `/panel/faturalar?fatura=${encodeURIComponent(b)}`,
      });
    }
    return out.sort((x, y) => y.day.localeCompare(x.day));
  }

  // ─────────────────────────────────────────── C14: the next 30 days

  private async forecast(ctx: StaffContext, today: string): Promise<ForecastDTO> {
    const start = (await this.d.money.get(ctx)).totalKurus;
    return { ...(await this.forecastFor(ctx.cafe.id, ctx.permissions, today, start)), startKurus: start };
  }

  private async forecastFor(cafeId: string, permissions: ReadonlySet<Permission>, today: string, start?: number | null): Promise<ForecastDTO> {
    const tz = (await this.d.directory.getSettings(cafeId)).timeZone;
    const through = plusDays(today, FORECAST_DAYS - 1);
    const history = plusDays(today, -FORECAST_HISTORY_DAYS);
    const startKurus = start === undefined ? await this.d.money.totalOf(cafeId) : start;
    const [payments, bills, debts, workDays, rates, payouts, planned] = await Promise.all([
      this.d.payments.listSettled(cafeId, startOfLocalDay(new Date(`${history}T12:00:00Z`), tz), startOfLocalDay(new Date(`${today}T12:00:00Z`), tz)),
      this.d.bills.listBills(cafeId, { from: plusDays(today, -45), to: today }),
      this.d.debts.overview(cafeId, permissions),
      this.d.shifts.listWorkDays(cafeId, "0000-01-01", today),
      this.d.shifts.listRates(cafeId),
      this.d.shifts.listPayouts(cafeId),
      this.d.shifts.listShifts(cafeId, plusDays(today, 1), through),
    ]);

    // Sales as usual for each weekday: cash and card, less refunds, over the last four weeks.
    const sales = new Map<number, number>();
    for (const p of payments) {
      if (p.method !== "cash" && p.method !== "card") continue;
      const w = weekdayOf(localDateKey(p.settledAt!, tz));
      sales.set(w, (sales.get(w) ?? 0) + (p.kind === "sale" ? p.amountKurus : -p.amountKurus));
    }
    const weeks = FORECAST_HISTORY_DAYS / 7;
    for (const [w, k] of sales) sales.set(w, Math.round(k / weeks));
    const live = bills.filter((b) => !b.voidedAt);
    const sum = (lines: { category: BillCategory; totalKurus: number }[], kinds: BillCategory[]) =>
      lines.filter((l) => kinds.includes(l.category)).reduce((s, l) => s + l.totalKurus, 0);
    const spendPerDay = Math.round(
      live.filter((b) => b.date >= history && b.date < today).reduce((s, b) => s + sum(b.lines, EVERYDAY), 0) / FORECAST_HISTORY_DAYS,
    );

    const events: ForecastEvent[] = [];
    const undated: { label: string; kurus: number }[] = [];
    // What is owed: on its day, or today when it is late or has no day.
    for (const r of debts.rows) {
      if (r.kind === "wages") continue;
      if (r.kind === "loan" && !r.dueDate) {
        undated.push({ label: r.name, kurus: r.amountKurus });
        continue;
      }
      const day = !r.dueDate || r.dueDate < today ? today : r.dueDate;
      if (day > through) continue;
      events.push({ day, kurus: -r.amountKurus, kind: r.kind, label: r.detail ? `${r.name} · ${r.detail}` : r.name });
    }
    // Pay: what earlier months still owe goes today; this month's on PAY_DAY of the next.
    const month = today.slice(0, 7);
    const payDayAfter = (m: string) => plusDays(`${m}-01`, 31).slice(0, 7) + `-${String(PAY_DAY).padStart(2, "0")}`;
    const wagesBy = new Map<string, number>();
    for (const months of owedByMonth(workDays, rates, payouts).values())
      for (const [m, k] of months) {
        const day = m < month ? today : payDayAfter(m);
        wagesBy.set(day, (wagesBy.get(day) ?? 0) + k);
      }
    // …and the shifts planned from tomorrow, paid the month after they're worked.
    for (const s of planned)
      for (const memberId of s.memberIds) {
        const rate = rateOn(rates, memberId, s.day);
        if (rate === null) continue;
        const day = payDayAfter(s.day.slice(0, 7));
        wagesBy.set(day, (wagesBy.get(day) ?? 0) + Math.round(((s.endMinutes - s.startMinutes) * rate) / 60));
      }
    for (const [day, k] of wagesBy) if (day <= through && k > 0) events.push({ day, kurus: -k, kind: "wages", label: "Maaşlar" });
    // Rent and the like come again a month on, unless that month's bill is already in.
    for (const b of live) {
      const k = sum(b.lines, MONTHLY);
      if (!k) continue;
      const next = sameDayNextMonth(b.date);
      if (next <= today || next > through) continue;
      const already = live.some((x) => x.id !== b.id && x.supplierId === b.supplierId && x.date > plusDays(b.date, 20) && sum(x.lines, MONTHLY) > 0);
      if (already) continue;
      const name = b.supplierId ? b.lines.find((l) => MONTHLY.includes(l.category))?.name : null;
      events.push({ day: next, kurus: -k, kind: "rent", label: `${name ?? "Aylık gider"} (tahmini)` });
    }

    const f = forecast({ today, days: FORECAST_DAYS, startKurus: startKurus ?? 0, salesByWeekday: sales, dailySpendKurus: spendPerDay, events });
    const shortfall = f.days.find((d) => d.balanceKurus < 0) ?? null;
    return {
      startKurus,
      days: f.days,
      lowest: f.lowest,
      shortfall: shortfall && { day: shortfall.day, balanceKurus: shortfall.balanceKurus },
      salesPerWeekKurus: [...sales.values()].reduce((s, k) => s + k, 0),
      spendPerDayKurus: spendPerDay,
      events: events.sort((a, b) => a.day.localeCompare(b.day) || a.kurus - b.kurus) as ForecastEventDTO[],
      undated,
    };
  }

  // ─────────────────────────────────────────── C15: what to order

  private async orderSuggestions(ctx: StaffContext, today: string): Promise<OrderSuggestionDTO[]> {
    const cafeId = ctx.cafe.id;
    const tz = (await this.d.directory.getSettings(cafeId)).timeZone;
    const since = startOfLocalDay(new Date(`${plusDays(today, -FORECAST_HISTORY_DAYS)}T12:00:00Z`), tz);
    const [items, moves, bills, suppliers] = await Promise.all([
      this.d.stock.listItems(cafeId),
      this.d.stock.listMoves(cafeId, { reasons: ["sale", "refund", "waste"], from: since, limit: ALL }),
      this.d.bills.listBills(cafeId, { from: plusDays(today, -180), to: today }),
      this.d.bills.listSuppliers(cafeId, { includeArchived: true }),
    ]);
    const used = new Map<string, number>();
    for (const m of moves) used.set(m.itemId, (used.get(m.itemId) ?? 0) - m.changeMilli);
    // Who it usually comes from: the supplier on its newest bill.
    const from = new Map<string, string | null>();
    for (const b of [...bills].filter((x) => !x.voidedAt).sort((a, b) => a.date.localeCompare(b.date)))
      for (const l of b.lines) if (l.itemId) from.set(l.itemId, b.supplierId);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));
    const groups = new Map<string | null, OrderSuggestionDTO["lines"]>();
    for (const item of items) {
      const usedPerDayMilli = Math.max(0, Math.round((used.get(item.id) ?? 0) / FORECAST_HISTORY_DAYS));
      const amount = orderAmount({ qtyMilli: item.qtyMilli, minMilli: item.minMilli, usedPerDayMilli });
      if (!amount) continue;
      const supplierId = from.get(item.id) ?? null;
      const lines = groups.get(supplierId) ?? [];
      lines.push({
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qtyMilli: item.qtyMilli,
        usedPerDayMilli,
        daysLeft: amount.daysLeft,
        orderMilli: amount.orderMilli,
      });
      groups.set(supplierId, lines);
    }
    return [...groups.entries()]
      .map(([supplierId, lines]) => {
        const s = supplierId ? supplierById.get(supplierId) : undefined;
        lines.sort((a, b) => a.daysLeft - b.daysLeft);
        const list = lines.map((l) => `${l.name} ${l.orderMilli / MILLI} ${UNIT_WORD[l.unit]}`).join(", ");
        return {
          supplierId,
          name: s?.name ?? "Tedarikçisi belli değil",
          phone: s?.phone ?? null,
          lines,
          message: `Merhaba, ${ctx.cafe.name} için sipariş: ${list}. Teşekkürler.`,
        };
      })
      .sort((a, b) => a.lines[0]!.daysLeft - b.lines[0]!.daysLeft);
  }

  // ─────────────────────────────────────────── C16: the week's plan

  private async staffing(cafeId: string, today: string): Promise<StaffingDTO> {
    const tz = (await this.d.directory.getSettings(cafeId)).timeZone;
    const history = plusDays(today, -FORECAST_HISTORY_DAYS);
    const nextWeek = plusDays(weekStartOf(today), 7);
    const [orders, past, upcoming] = await Promise.all([
      this.d.orders.listOrders(cafeId, { from: history, through: plusDays(today, -1), limit: ALL }),
      this.d.shifts.listShifts(cafeId, history, plusDays(today, -1)),
      this.d.shifts.listShifts(cafeId, nextWeek, plusDays(nextWeek, 6)),
    ]);
    // The week owners plan is the next one; while it is empty, the rest of this one.
    const week = upcoming.length ? nextWeek : weekStartOf(today);
    const plan = upcoming.length ? upcoming : await this.d.shifts.listShifts(cafeId, today, plusDays(weekStartOf(today), 6));
    const people = (shifts: typeof plan, day: string, hour: number) =>
      shifts.filter((s) => s.day === day && s.startMinutes < (hour + 1) * 60 && s.endMinutes > hour * 60).reduce((n, s) => n + s.memberIds.length, 0);

    // Orders an hour on each weekday, and how many people there were.
    const counts = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "paid" && o.status !== "refunded") continue;
      const day = o.businessDay;
      const hour = localHourOf(o.createdAt, tz);
      counts.set(`${day}:${hour}`, (counts.get(`${day}:${hour}`) ?? 0) + 1);
    }
    let orderSum = 0;
    let personHours = 0;
    const byWeekdayHour = new Map<string, number>();
    for (const [k, n] of counts) {
      const [day, h] = [k.slice(0, 10), Number(k.slice(11))];
      byWeekdayHour.set(`${weekdayOf(day)}:${h}`, (byWeekdayHour.get(`${weekdayOf(day)}:${h}`) ?? 0) + n);
      const p = people(past, day, h);
      if (p > 0) {
        orderSum += n;
        personHours += p;
      }
    }
    const fromHistory = personHours >= 20;
    const usualLoad = fromHistory ? Math.round((orderSum / personHours) * 10) / 10 : STAFFING_DEFAULT_LOAD;
    const weeks = FORECAST_HISTORY_DAYS / 7;
    const slots: StaffingSlot[] = [];
    for (let i = 0; i < 7; i++) {
      const day = plusDays(week, i);
      if (day < today) continue;
      for (let hour = 0; hour < 24; hour++) {
        const avg = (byWeekdayHour.get(`${weekdayOf(day)}:${hour}`) ?? 0) / weeks;
        const ppl = people(plan, day, hour);
        if (avg > 0 || ppl > 0) slots.push({ weekday: weekdayOf(day), hour, orders: Math.round(avg * 10) / 10, people: ppl });
      }
    }
    const dayOf = (weekday: number) => plusDays(week, weekday - 1);
    return {
      week,
      usualLoad,
      fromHistory,
      hints: staffingHints(slots, usualLoad).map((h) => ({
        kind: h.kind,
        day: dayOf(h.weekday),
        fromHour: h.fromHour,
        toHour: h.toHour,
        orders: h.orders,
        people: h.people,
      })),
    };
  }

  // ───────────────────────────────────────────

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.d.now(), (await this.d.directory.getSettings(cafeId)).timeZone);
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids)) {
      const member = await this.d.staff.getMember(id);
      const account = member && (await this.d.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }
}

function localHourOf(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(at));
}

/** The same day of the next month, or its last day when it has fewer: 31 Jan → 28 Feb. */
export function sameDayNextMonth(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
