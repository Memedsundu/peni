import type { ForecastDTO, ForecastEventDTO, OrderSuggestionDTO, StaffingDTO, WatchDTO, WatchPriceDTO, WatchUnusualDTO } from "@peni/api";
import {
  billSpikes,
  cashGapLimit,
  costOn,
  forecast,
  FORECAST_DAYS,
  FORECAST_HISTORY_DAYS,
  judge,
  learnedOrder,
  letGoCounts,
  localDateKey,
  localHour,
  marginPct,
  MILLI,
  orderAmount,
  orderHabits,
  ORDER_LEARN_DAYS,
  ORDER_LEARN_WITHIN,
  owedByMonth,
  plusDays,
  PRICE_CHANGE_MIN_PCT,
  priceChanges,
  priceForMargin,
  rateOn,
  recipeCost,
  STAFFING_DEFAULT_LOAD,
  STAFFING_SPREAD_AFTER,
  staffingBars,
  staffingHints,
  startOfLocalDay,
  twiceBills,
  unusualVoids,
  WATCH_BASELINE_WEEKS,
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
  type WatchDismissal,
  type WatchKind,
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

/** A finding with what kind it is and whom it is about, and whether the owner's earlier "Gördüm"s keep it out. */
interface Found<T> {
  dto: T;
  kind: WatchKind;
  subject: string | null;
  quiet: boolean;
}

type LetGo = ReturnType<typeof letGoCounts>;

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
 * that look short or over-staffed (C16). No assistant is needed. What counts as unusual comes
 * from this café's own numbers. Prices and unusual findings can be let go ("Gördüm") and stay
 * hidden for everyone; a kind let go again and again for one supplier, person or item is shown
 * less, and says so.
 */
export class WatchService {
  constructor(private readonly d: WatchDeps) {}

  async get(ctx: StaffContext): Promise<WatchDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see Gözcü", 403);
    const p = ctx.permissions;
    const cafeId = ctx.cafe.id;
    const [today, seen] = await Promise.all([this.today(cafeId), this.d.store.listDismissed(cafeId)]);
    const [found, forecastDto, orders, staffing] = await Promise.all([
      this.findings(cafeId, today, seen),
      p.has("cash.manage") && p.has("debts.view") ? this.forecast(ctx, today) : null,
      p.has("stock.view") ? this.orderSuggestions(ctx, today) : null,
      p.has("shifts.view") ? this.staffing(cafeId, today) : null,
    ]);
    return {
      today,
      prices: found.prices.filter((x) => x.open).map((x) => x.dto),
      unusual: found.unusual.filter((x) => x.open).map((x) => x.dto),
      seen: [...found.prices, ...found.unusual].filter((x) => x.hidden).length,
      quiet: [...found.prices, ...found.unusual].filter((x) => x.quiet && !x.hidden).length,
      forecast: forecastDto,
      orders,
      staffing,
    };
  }

  /** "Gördüm": a price or an unusual finding is let go for everyone, and remembered by kind and by whom it was about. */
  async dismiss(ctx: StaffContext, input: { key: string; note?: string | null }): Promise<WatchDTO> {
    if (!ctx.permissions.has("reports.view")) throw new AppError("FORBIDDEN", "Your role can't see Gözcü", 403);
    const today = await this.today(ctx.cafe.id);
    const found = await this.findings(ctx.cafe.id, today, await this.d.store.listDismissed(ctx.cafe.id));
    const it = [...found.prices, ...found.unusual].find((x) => x.dto.key === input.key);
    if (!it) throw new AppError("WATCH_KEY", "No such finding now", 404);
    await this.d.store.dismiss({
      cafeId: ctx.cafe.id,
      key: input.key,
      kind: it.kind,
      subject: it.subject,
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
    const { prices, unusual } = await this.findings(cafeId, today, await this.d.store.listDismissed(cafeId));
    const open = [
      ...unusual.filter((x) => x.open).map((x) => x.dto.name ?? x.dto.kind),
      ...prices.filter((x) => x.open && x.dto.products.some((p) => p.suggestedKurus !== null)).map((x) => x.dto.item),
    ];
    let short: { day: string; balanceKurus: number } | null = null;
    if (permissions.has("cash.manage") && permissions.has("debts.view")) {
      const f = await this.forecastFor(cafeId, permissions, today);
      // Only when it is near enough to act on.
      if (f.shortfall && f.startKurus !== null && f.shortfall.day <= plusDays(today, 14)) short = f.shortfall;
    }
    return { count: open.length, names: open, short };
  }

  /**
   * Prices and unusual findings, each marked: hidden (someone said "Gördüm"), quiet (left out
   * because such ones keep being let go) or open.
   */
  private async findings(cafeId: string, today: string, seen: WatchDismissal[]) {
    const hidden = new Set(seen.map((s) => s.key));
    const letGo = letGoCounts(seen, this.d.now());
    const [prices, unusual] = await Promise.all([this.prices(cafeId, today, letGo), this.unusual(cafeId, today, letGo)]);
    const mark = <T extends { key: string }>(x: Found<T>) => ({ ...x, hidden: hidden.has(x.dto.key), open: !hidden.has(x.dto.key) && !x.quiet });
    return { prices: prices.map(mark), unusual: unusual.map(mark) };
  }

  // ─────────────────────────────────────────── C12: prices

  private async prices(cafeId: string, today: string, letGo: LetGo): Promise<Found<WatchPriceDTO>[]> {
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
      // An item whose price findings keep being let go: only moves of twice the usual size.
      const v = judge(Math.abs(c.changePct), PRICE_CHANGE_MIN_PCT, letGo("price", c.itemId));
      const dto: WatchPriceDTO = {
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
        letGo: v.letGo,
        products,
      };
      return { dto, kind: "price" as const, subject: c.itemId, quiet: v.quiet };
    });
  }

  // ─────────────────────────────────────────── C13: unusual activity

  private async unusual(cafeId: string, today: string, letGo: LetGo): Promise<Found<WatchUnusualDTO>[]> {
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
    const out: Found<WatchUnusualDTO>[] = [];

    // Drawer counts: an opening against the café's earlier openings, a closing against its closings.
    const counts = sessions.flatMap((s) =>
      (["open", "close"] as const).flatMap((when) => {
        const count = when === "open" ? s.opening : s.closing;
        return count && count.expectedKurus !== null ? [{ session: s.id, when, count, day: localDateKey(count.at, tz) }] : [];
      }),
    );
    const limit = {
      open: cashGapLimit(counts.filter((c) => c.when === "open" && c.day < from).map((c) => c.count.differenceKurus)),
      close: cashGapLimit(counts.filter((c) => c.when === "close" && c.day < from).map((c) => c.count.differenceKurus)),
    };
    for (const { session, when, count, day } of counts) {
      if (day < from) continue;
      const v = judge(Math.abs(count.differenceKurus), limit[when], letGo("cashGap", count.byMemberId));
      if (!v.show && !v.quiet) continue;
      out.push({
        dto: {
          key: `cash:${session}:${when}`,
          kind: "cashGap",
          day,
          amountKurus: count.differenceKurus,
          usual: null,
          count: null,
          limit: v.limit,
          letGo: v.letGo,
          name: (await this.names([count.byMemberId])).get(count.byMemberId) ?? null,
          note: count.note,
          href: "/panel/nakit",
        },
        kind: "cashGap",
        subject: count.byMemberId,
        quiet: v.quiet,
      });
    }

    const voids = unusualVoids(orders, this.d.now(), (m) => letGo("voids", m));
    const voidNames = await this.names(voids.map((v) => v.memberId));
    for (const v of voids)
      out.push({
        dto: {
          key: `voids:${v.memberId}:${weekStartOf(today)}`,
          kind: "voids",
          day: today,
          amountKurus: null,
          usual: v.usual,
          count: v.count,
          limit: v.limit,
          letGo: v.letGo,
          name: voidNames.get(v.memberId) ?? null,
          note: null,
          href: "/kasa",
        },
        kind: "voids",
        subject: v.memberId,
        quiet: v.quiet,
      });

    for (const s of billSpikes(bills, from, (id) => letGo("billSpike", id))) {
      const b = billById.get(s.billId)!;
      out.push({
        dto: {
          key: `spike:${b.id}`,
          kind: "billSpike",
          day: b.date,
          amountKurus: b.totalKurus,
          usual: s.usualKurus,
          count: null,
          limit: s.limitKurus,
          letGo: s.letGo,
          name: supplierName.get(s.supplierId) ?? null,
          note: null,
          href: `/panel/faturalar?fatura=${encodeURIComponent(b.id)}`,
        },
        kind: "billSpike",
        subject: s.supplierId,
        quiet: s.quiet,
      });
    }

    for (const t of twiceBills(bills, from, (id) => letGo("billTwice", id))) {
      const [a, b] = t.billIds;
      const second = billById.get(b)!;
      out.push({
        dto: {
          key: `twice:${a}:${b}`,
          kind: "billTwice",
          day: second.date,
          amountKurus: second.totalKurus,
          usual: null,
          count: 2,
          limit: null,
          letGo: t.letGo,
          name: supplierName.get(t.supplierId) ?? null,
          note: null,
          href: `/panel/faturalar?fatura=${encodeURIComponent(b)}`,
        },
        kind: "billTwice",
        subject: t.supplierId,
        quiet: t.quiet,
      });
    }
    return out.sort((x, y) => y.dto.day.localeCompare(x.dto.day));
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
    // How this café answered earlier suggestions: the bills that followed them.
    const suggested = await this.d.store.listSuggestions(cafeId, plusDays(today, -ORDER_LEARN_DAYS - ORDER_LEARN_WITHIN));
    const bought = bills
      .filter((b) => !b.voidedAt)
      .flatMap((b) => b.lines.flatMap((l) => (l.itemId && l.qtyMilli ? [{ itemId: l.itemId, date: b.date, qtyMilli: l.qtyMilli }] : [])));
    const habits = orderHabits(suggested, bought, today);
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
      const habit = habits.get(item.id);
      lines.push({
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qtyMilli: item.qtyMilli,
        usedPerDayMilli,
        daysLeft: amount.daysLeft,
        orderMilli: learnedOrder(amount.orderMilli, habit),
        ruleMilli: amount.orderMilli,
        habit: habit ? { times: habit.times, pct: Math.round(habit.ratio * 100) } : null,
      });
      groups.set(supplierId, lines);
    }
    // Remembered as the rule said it, so the next bills can be compared with it.
    await this.d.store.noteSuggestions(
      cafeId,
      today,
      [...groups.values()].flat().map((l) => ({ itemId: l.itemId, orderMilli: l.ruleMilli })),
    );
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
      const hour = localHour(o.createdAt, tz);
      counts.set(`${day}:${hour}`, (counts.get(`${day}:${hour}`) ?? 0) + 1);
    }
    let orderSum = 0;
    let personHours = 0;
    const byWeekdayHour = new Map<string, number>();
    // Orders and people in each weekday-hour that had someone on, for this café's own busy and quiet.
    const staffed = new Map<string, { orders: number; people: number }>();
    for (const [k, n] of counts) {
      const [day, h] = [k.slice(0, 10), Number(k.slice(11))];
      byWeekdayHour.set(`${weekdayOf(day)}:${h}`, (byWeekdayHour.get(`${weekdayOf(day)}:${h}`) ?? 0) + n);
      const p = people(past, day, h);
      if (p > 0) {
        orderSum += n;
        personHours += p;
        const row = staffed.get(`${weekdayOf(day)}:${h}`) ?? { orders: 0, people: 0 };
        staffed.set(`${weekdayOf(day)}:${h}`, { orders: row.orders + n, people: row.people + p });
      }
    }
    const fromHistory = personHours >= 20;
    const usualLoad = fromHistory ? Math.round((orderSum / personHours) * 10) / 10 : STAFFING_DEFAULT_LOAD;
    const pastLoads = fromHistory ? [...staffed.values()].map((x) => x.orders / x.people) : [];
    const bars = staffingBars(pastLoads, usualLoad);
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
      ...bars,
      barsFromHistory: pastLoads.length >= STAFFING_SPREAD_AFTER,
      hints: staffingHints(slots, bars).map((h) => ({
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

/** The same day of the next month, or its last day when it has fewer: 31 Jan → 28 Feb. */
export function sameDayNextMonth(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
