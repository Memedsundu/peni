import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );

/** Cash and card in, refunds out, settled on these Istanbul days: worked out apart from the report. */
async function moneyIn(from: string, through: string, upTo?: Date): Promise<number> {
  const start = new Date(`${from}T00:00:00+03:00`);
  const end = upTo ? new Date(upTo.getTime() + 1) : new Date(new Date(`${through}T00:00:00+03:00`).getTime() + 86_400_000);
  const payments = await app.paymentStore.listSettled("cafe_moda", start, end);
  return payments.filter((p) => p.method === "cash" || p.method === "card").reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0);
}

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  [leyla, ece] = await Promise.all([at("leyla"), at("ece")]);
});

describe("Raporlar (plan piece 23)", () => {
  it("opens on this month so far against the same days last month, with money in, spending and what was left", async () => {
    const r = await app.salesReports.get(leyla);
    expect(r).toMatchObject({
      today: "2026-10-16",
      from: "2026-10-01",
      through: "2026-10-16",
      previous: { from: "2026-09-01", through: "2026-09-16", untilTime: "12:00" },
    });
    expect(r.totals.salesKurus).toBe(await moneyIn("2026-10-01", "2026-10-16"));
    // Today is half done, so 16 September counts only up to noon too.
    expect(r.previousTotals.salesKurus).toBe(await moneyIn("2026-09-01", "2026-09-16", new Date("2026-09-16T09:00:00Z")));
    expect(r.previousTotals.salesKurus).toBeLessThan(await moneyIn("2026-09-01", "2026-09-16"));
    expect(r.totals.salesKurus).toBeGreaterThan(0);
    expect(r.totals.profitKurus).toBe(r.totals.salesKurus - r.totals.expensesKurus);

    // Orders on those days, the refunded one left out; nothing is sold yet today.
    const paid = (await app.orderStore.listOrders("cafe_moda", { from: "2026-10-01", through: "2026-10-16", limit: 100_000 })).filter(
      (o) => o.status === "paid",
    );
    expect(r.totals.orders).toBe(paid.length);
    expect(r.totals.avgOrderKurus).toBe(Math.round(paid.reduce((s, o) => s + o.totalKurus, 0) / paid.length));

    // Spending: October's bills by kind, and pay for the hours entered.
    expect(r.expenses.find((e) => e.kind === "rent")!.kurus).toBe(4_500_000);
    expect(r.expenses.find((e) => e.kind === "utilities")!.kurus).toBe(385_000);
    expect(r.expenses.find((e) => e.kind === "wages")!.kurus).toBeGreaterThan(0);
    expect(r.expenses.reduce((s, e) => s + e.kurus, 0)).toBe(r.totals.expensesKurus);

    // Paid with: the month's money is cash and card.
    expect(r.paidWith.cashKurus + r.paidWith.cardKurus).toBe(r.totals.salesKurus);

    // Day by day, each against the same day of September.
    expect(r.series.step).toBe("day");
    expect(r.series.points).toHaveLength(16);
    expect(r.series.points[0]).toMatchObject({
      key: "2026-10-01",
      salesKurus: await moneyIn("2026-10-01", "2026-10-01"),
      previousKurus: await moneyIn("2026-09-01", "2026-09-01"),
      previousKey: "2026-09-01",
    });
    expect(r.series.points.at(-1)).toMatchObject({ key: "2026-10-16", salesKurus: 0 });
    expect(r.weekdays.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // Weekends sell more.
    expect(r.weekdays[5]!.avgKurus).toBeGreaterThan(r.weekdays[1]!.avgKurus);
    expect(r.hours[0]!.hour).toBe("08");

    // From September, the first month with numbers, to now.
    expect(r.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(r.months[0]!.salesKurus).toBe(await moneyIn("2026-09-01", "2026-09-30"));
    expect(r.months[0]!.expensesKurus).toBeGreaterThan(4_500_000);
  });

  it("ranks products by profit, each costed by its recipe at the latest bill prices", async () => {
    const r = await app.salesReports.get(leyla, { from: "2026-09-01", through: "2026-10-15" });
    const latte = r.products.find((p) => p.productId === "latte")!;
    const menu = await app.stock.recipes(leyla);
    const cost = menu.recipes.find((p) => p.productId === "latte")!.costKurus;
    expect(cost).not.toBeNull();
    expect(latte).toMatchObject({ name: "Latte", unitCostKurus: cost, profitKurus: latte.salesKurus - cost! * latte.quantity });
    expect(latte.marginPercent).toBe(Math.round((latte.profitKurus! / latte.salesKurus) * 100));
    const priced = r.products.filter((p) => p.profitKurus !== null);
    expect(priced.map((p) => p.profitKurus)).toEqual([...priced.map((p) => p.profitKurus)].sort((a, b) => b! - a!));
    // The unpriced ones come last.
    expect(r.products.slice(priced.length).every((p) => p.unitCostKurus === null)).toBe(true);
    expect(r.unpriced).toBe(r.products.length - priced.length);
    // Every piece sold is in the ranking.
    const orders = (await app.orderStore.listOrders("cafe_moda", { from: "2026-09-01", through: "2026-10-15", status: "paid", limit: 100_000 })).flatMap(
      (o) => o.lines,
    );
    expect(r.products.reduce((s, p) => s + p.quantity, 0)).toBe(orders.reduce((s, l) => s + l.quantity, 0));
    expect(r.series.step).toBe("day");
  });

  it("shows one day hour by hour against the same weekday a week before, and longer periods by week", async () => {
    const r = await app.salesReports.get(leyla, { from: "2026-10-10", through: "2026-10-10" });
    expect(r.previous).toEqual({ from: "2026-10-03", through: "2026-10-03", untilTime: null });
    expect(r.previousTotals.salesKurus).toBe(await moneyIn("2026-10-03", "2026-10-03"));
    expect(r.series.step).toBe("hour");
    expect(r.series.points[0]).toMatchObject({ key: "08", previousKey: "08" });
    expect(r.series.points.reduce((s, p) => s + p.salesKurus, 0)).toBe(await moneyIn("2026-10-10", "2026-10-10"));
    expect(r.weekdays).toEqual([]);

    const long = await app.salesReports.get(leyla, { from: "2026-07-01", through: "2026-10-15" });
    expect(long.series.step).toBe("week");
    expect(long.series.points[0]!.key).toBe("2026-06-29");
  });

  it("is for those who see reports, for days that have been", async () => {
    expect(await code(app.salesReports.get(ece))).toBe("FORBIDDEN");
    expect(await code(app.salesReports.get(leyla, { from: "2026-10-10", through: "2026-10-17" }))).toBe("REPORT_RANGE");
    expect(await code(app.salesReports.get(leyla, { from: "2026-10-10", through: "2026-10-09" }))).toBe("REPORT_RANGE");
    expect(await code(app.salesReports.get(leyla, { from: "2025-01-01", through: "2026-10-15" }))).toBe("REPORT_RANGE");
    expect(await code(app.salesReports.get(leyla, { from: "2026-02-30", through: "2026-03-02" }))).toBe("REPORT_RANGE");
  });

  it("puts today's sales on Bugün against last Friday up to the same time, for those who see reports", async () => {
    const today = await app.alerts.today(leyla);
    const lastFriday = await app.paymentStore.listSettled("cafe_moda", new Date("2026-10-08T21:00:00Z"), new Date("2026-10-09T09:00:00Z"));
    expect(today.sales).toMatchObject({ salesKurus: 0, orders: 0, lastWeekDay: "2026-10-09" });
    expect(today.sales!.lastWeekKurus).toBe(
      lastFriday.filter((p) => p.method !== "peni" && p.method !== "askida").reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0),
    );
    expect(today.sales!.hours[0]!.hour).toBe("08");
    expect((await app.alerts.today(ece)).sales).toBeNull();
  });
});
