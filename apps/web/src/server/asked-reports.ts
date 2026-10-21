import type { AskedResultDTO } from "@peni/api";
import {
  askedCompareRange,
  askedRange,
  askedReportProblem,
  bucketOf,
  bucketsOf,
  dayPay,
  lineTotal,
  localDateKey,
  localHour,
  plusDays,
  rateOn,
  recipeCost,
  startOfLocalDay,
  weekdayOf,
  type AskedReport,
  type BillStore,
  type MenuStore,
  type Order,
  type OrderStore,
  type Payment,
  type PaymentStore,
  type PeniDirectory,
  type ShiftStore,
  type StockStore,
} from "@peni/core";
import { trLower } from "@peni/brand/format";
import { AppError } from "./errors";
import { requirePermission, type StaffContext } from "./staff";

const ALL = 100_000;
/** Products, categories and suppliers past this many are added together as "the rest". */
const ROWS_SHOWN = 15;

type Range = { from: string; through: string };
/** One thing that happened: a payment, an order line, a bill line or a day's pay, with what it adds. */
type Fact = { day: string; at: Date | null; key: string; label: string | null; value: number };

/**
 * Reports on request (plan piece 29, B9): the assistant writes down what was asked (sales
 * by hour, spending by supplier) and this adds it up from the café's records. The model
 * never sees more than the numbers that come out, and never writes a query of its own.
 *
 * Totals follow Raporlar: money in is cash and card, refunds out; spending is the bills
 * dated in the period plus pay for the hours worked. Splitting sales by product needs the
 * orders, so that one counts each order after its discounts, however it was paid.
 */
export class AskedReportService {
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

  /** Runs it for today: named periods ("bu ay") are this month now. Needs "reports.view". */
  async run(ctx: StaffContext, spec: AskedReport): Promise<AskedResultDTO> {
    requirePermission(ctx, "reports.view");
    const cafeId = ctx.cafe.id;
    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    const today = localDateKey(this.now(), tz);
    const problem = askedReportProblem(spec, today);
    if (problem) throw new AppError("ASKED_REPORT", `Can't run this report: ${problem}`, 400);
    const range = askedRange(spec, today)!;
    const compare = askedCompareRange(spec.compare, range);
    const earliest = compare && compare.from < range.from ? compare.from : range.from;
    const latest = compare && compare.through > range.through ? compare.through : range.through;
    const dayStart = (day: string) => startOfLocalDay(new Date(`${day}T12:00:00Z`), tz);
    const dayOf = (at: Date) => localDateKey(at, tz);
    const hourOf = (at: Date) => String(localHour(at, tz)).padStart(2, "0");

    // The compared period's last day stops at this time of day when the report runs to now,
    // as on Raporlar; otherwise today always looks like a bad day.
    const sinceMidnight = this.now().getTime() - dayStart(today).getTime();
    const cutoff = compare && range.through === today ? new Date(dayStart(compare.through).getTime() + sinceMidnight) : null;
    const late = (f: Fact) => cutoff !== null && f.at !== null && f.day === compare!.through && f.at > cutoff;

    const filtered = spec.products.length > 0 || spec.categories.length > 0;
    const [menu, categories] = await Promise.all([this.menu.listMenu(cafeId, { includeArchived: true }), this.menu.listCategories(cafeId)]);
    const names = new Map(menu.map((p) => [p.productId, p.name]));
    const categoryOf = new Map(menu.map((p) => [p.productId, p.categoryId]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    // Which products the names ask for: part of a name will do ("latte" finds "Oat latte").
    const matched: string[] = [];
    let wanted: Set<string> | null = null;
    if (filtered) {
      wanted = new Set();
      const like = (name: string, asked: string[]) => asked.some((a) => trLower(name).includes(trLower(a.trim())));
      for (const p of menu)
        if (like(p.name, spec.products)) {
          wanted.add(p.productId);
          matched.push(p.name);
        }
      for (const c of categories)
        if (like(c.name, spec.categories)) {
          matched.push(c.name);
          for (const p of menu) if (p.categoryId === c.id) wanted.add(p.productId);
        }
    }
    const notes = new Set<AskedResultDTO["notes"][number]>();
    if (wanted && wanted.size === 0) notes.add("noMatch");

    const facts: Fact[] = [];
    let noCost = 0;
    const needOrders = spec.measure === "orders" || spec.measure === "quantity" || ((spec.measure === "sales" || spec.measure === "profit") && orderBased(spec));
    const needPayments = (spec.measure === "sales" || spec.measure === "profit") && !orderBased(spec);
    const needSpending = spec.measure === "expenses" || (spec.measure === "profit" && !orderBased(spec));

    if (needOrders) {
      const orders = await this.orders.listOrders(cafeId, { from: earliest, through: latest, status: "paid", limit: ALL });
      const [recipes, items] = spec.measure === "profit" ? await Promise.all([this.stock.listRecipes(cafeId), this.stock.listItems(cafeId, { includeArchived: true })]) : [[], []];
      const itemMap = new Map(items.map((i) => [i.id, i]));
      const recipeMap = new Map(recipes.map((r) => [r.productId, r]));
      const unpriced = new Set<string>();
      for (const o of orders) {
        const at = o.paidAt ?? o.createdAt;
        // "Askıya bırak" lines are money for a coffee drunk later, not a product sold now.
        const lines = o.lines.filter((l) => !l.productId.startsWith("askida:") && (!wanted || wanted.has(l.productId)));
        if (!lines.length) continue;
        if (spec.measure === "orders") {
          // An order counts once, or once under each product or category it had.
          const keys = new Map<string, string | null>();
          for (const l of lines) {
            const k = this.keyOf(spec.by, o, l.productId, l.name, at, hourOf, names, categoryOf, categoryName);
            keys.set(k.key, k.label);
          }
          for (const [key, label] of keys) facts.push({ day: o.businessDay, at, key, label, value: 1 });
          continue;
        }
        for (const l of lines) {
          const k = this.keyOf(spec.by, o, l.productId, l.name, at, hourOf, names, categoryOf, categoryName);
          const sold = Math.round((lineTotal(l) * (100 - o.discountPercent)) / 100);
          let value = spec.measure === "quantity" ? l.quantity : sold;
          if (spec.measure === "profit") {
            const cost = recipeCost(recipeMap.get(l.productId) ?? null, itemMap);
            if (cost === null) {
              unpriced.add(l.productId);
              continue;
            }
            value = sold - cost * l.quantity;
          }
          facts.push({ day: o.businessDay, at, ...k, value });
        }
      }
      noCost = unpriced.size;
      if (noCost) notes.add("noCost");
      if (spec.measure === "sales" || spec.measure === "profit") notes.add("orders");
    }

    if (needPayments) {
      const payments = await this.payments.listSettled(cafeId, dayStart(earliest), dayStart(plusDays(latest, 1)));
      // Money in is cash and card; split by how it was paid, peni and the askı show too.
      const counted = (p: Payment) => spec.by === "payment" || p.method === "cash" || p.method === "card";
      for (const p of payments.filter(counted)) {
        const at = p.settledAt!;
        const day = dayOf(at);
        const value = p.kind === "sale" ? p.amountKurus : -p.amountKurus;
        const key = spec.by === "payment" ? p.method : spec.by === "hour" ? hourOf(at) : timeKey(spec.by, day);
        facts.push({ day, at, key, label: null, value });
      }
    }

    if (needSpending) {
      const sign = spec.measure === "profit" ? -1 : 1;
      const [bills, suppliers, workDays, rates] = await Promise.all([
        this.bills.listBills(cafeId, { from: earliest }),
        spec.by === "supplier" ? this.bills.listSuppliers(cafeId, { includeArchived: true }) : Promise.resolve([]),
        this.shifts.listWorkDays(cafeId, earliest, latest),
        this.shifts.listRates(cafeId),
      ]);
      const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
      for (const b of bills) {
        if (b.voidedAt || b.date > latest) continue;
        for (const l of b.lines) {
          const k =
            spec.by === "expenseKind"
              ? { key: l.category, label: null }
              : spec.by === "supplier"
                ? { key: b.supplierId ?? "_none", label: b.supplierId ? (supplierName.get(b.supplierId) ?? null) : null }
                : { key: timeKey(spec.by, b.date), label: null };
          facts.push({ day: b.date, at: null, ...k, value: sign * l.totalKurus });
        }
      }
      for (const d of workDays) {
        const key = spec.by === "expenseKind" || spec.by === "supplier" ? "wages" : timeKey(spec.by, d.day);
        facts.push({ day: d.day, at: null, key, label: null, value: sign * dayPay(d.minutes, rateOn(rates, d.memberId, d.day)) });
      }
    }

    return shape(spec, range, compare, facts, late, { matched, notes: [...notes], noCost });
  }

  /** Where one order line goes: its hour, day, product, category or how it was paid. */
  private keyOf(
    by: AskedReport["by"],
    o: Order,
    productId: string,
    lineName: string,
    at: Date,
    hourOf: (at: Date) => string,
    names: Map<string, string>,
    categoryOf: Map<string, string | null>,
    categoryName: Map<string, string>,
  ): { key: string; label: string | null } {
    if (by === "product") return { key: productId, label: names.get(productId) ?? lineName };
    if (by === "category") {
      const c = categoryOf.get(productId) ?? null;
      return { key: c ?? "_none", label: c ? (categoryName.get(c) ?? null) : null };
    }
    if (by === "payment") return { key: o.paymentMethod ?? "cash", label: null };
    if (by === "hour") return { key: hourOf(at), label: null };
    return { key: timeKey(by, o.businessDay), label: null };
  }
}

/** Splitting sales or profit by product or category, or only some products, needs the orders. */
function orderBased(spec: AskedReport): boolean {
  return spec.by === "product" || spec.by === "category" || spec.products.length > 0 || spec.categories.length > 0;
}

function timeKey(by: AskedReport["by"], day: string): string {
  if (by === "day" || by === "week" || by === "month") return bucketOf(day, by);
  if (by === "weekday") return String(weekdayOf(day));
  return "all";
}

/** The facts into rows: this period's and the compared one's, side by side. */
function shape(
  spec: AskedReport,
  range: Range,
  compare: Range | null,
  facts: Fact[],
  late: (f: Fact) => boolean,
  extra: Pick<AskedResultDTO, "matched" | "notes" | "noCost">,
): AskedResultDTO {
  const unit = spec.measure === "orders" || spec.measure === "quantity" ? "count" : "kurus";
  const inside = (f: Fact, r: Range) => f.day >= r.from && f.day <= r.through;
  const now = new Map<string, number>();
  const before = new Map<string, number>();
  const labels = new Map<string, string | null>();
  let total = 0;
  let previousTotal = 0;
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  // Days, weeks and months line up by place: this month's 3rd week against last month's 3rd.
  const stepped = spec.by === "day" || spec.by === "week" || spec.by === "month";
  const keys = stepped ? bucketsOf(range.from, range.through, spec.by as "day" | "week" | "month") : [];
  const prevKeys = stepped && compare ? bucketsOf(compare.from, compare.through, spec.by as "day" | "week" | "month") : [];
  const placeOf = new Map(prevKeys.map((k, i) => [k, keys[i] ?? null]));

  for (const f of facts) {
    if (inside(f, range)) {
      add(now, f.key, f.value);
      total += f.value;
      if (!labels.has(f.key) || labels.get(f.key) === null) labels.set(f.key, f.label);
    }
    if (compare && inside(f, compare) && !late(f)) {
      previousTotal += f.value;
      const key = stepped ? placeOf.get(f.key) : f.key;
      if (key) add(before, key, f.value);
      if (!stepped && !labels.has(f.key)) labels.set(f.key, f.label);
    }
  }

  let order: string[];
  if (stepped) order = keys;
  else if (spec.by === "hour") {
    const used = [...new Set([...now.keys(), ...before.keys()])].sort();
    order = [];
    if (used.length) for (let h = Number(used[0]); h <= Number(used[used.length - 1]); h++) order.push(String(h).padStart(2, "0"));
  } else if (spec.by === "weekday") {
    const days = new Set<string>();
    for (let d = range.from; d <= range.through && days.size < 7; d = plusDays(d, 1)) days.add(String(weekdayOf(d)));
    order = [...days].sort();
  } else if (spec.by === "none") order = ["all"];
  else order = [...new Set([...now.keys(), ...before.keys()])].sort((a, b) => (now.get(b) ?? 0) - (now.get(a) ?? 0) || (before.get(b) ?? 0) - (before.get(a) ?? 0));

  const row = (key: string) => ({ key, label: labels.get(key) ?? null, value: now.get(key) ?? 0, previous: compare ? (before.get(key) ?? 0) : null });
  let rows = order.map(row);
  let rest: AskedResultDTO["rest"] = null;
  const categorical = spec.by === "product" || spec.by === "category" || spec.by === "supplier" || spec.by === "payment" || spec.by === "expenseKind";
  if (categorical && rows.length > ROWS_SHOWN) {
    const tail = rows.slice(ROWS_SHOWN);
    rows = rows.slice(0, ROWS_SHOWN);
    rest = { rows: tail.length, value: tail.reduce((s, r) => s + r.value, 0), previous: compare ? tail.reduce((s, r) => s + (r.previous ?? 0), 0) : null };
  }
  return {
    from: range.from,
    through: range.through,
    compareFrom: compare?.from ?? null,
    compareThrough: compare?.through ?? null,
    unit,
    rows,
    total,
    previousTotal: compare ? previousTotal : null,
    rest,
    ...extra,
  };
}
