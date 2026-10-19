import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";
import { sameDayNextMonth } from "./watch";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let murat: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
let keys = 0;
const key = () => `k${++keys}`;

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app, { drafts: false });
  [leyla, murat] = await Promise.all([at("leyla"), at("murat")]);
});

describe("Gözcü (plan piece 31)", { timeout: 30_000 }, () => {
  it("shows the prices bills changed, with a menu price that keeps a margin that fell", async () => {
    let w = await app.watch.get(leyla);
    const milk = w.prices.find((p) => p.itemId === "stk_sut")!;
    expect(milk).toMatchObject({ beforeKurus: 4_300, nowKurus: 4_500, changePct: 5, billId: "bil_seed_sut2", supplier: "Moda Süt", unit: "l" });
    // A point of margin on a latte isn't worth a new price.
    expect(milk.products).toEqual([expect.objectContaining({ name: "Latte", marginBeforePct: 80, marginNowPct: 79, suggestedKurus: null })]);

    // Milk at ₺150 a litre: the latte's 200 ml of it now costs ₺30.
    await app.bills.add(murat, {
      key: key(),
      supplierId: "sup_seed_sut",
      date: "2026-10-16",
      lines: [{ itemId: "stk_sut", name: "Süt", category: "ingredients", qtyMilli: 10_000, totalKurus: 150_000 }],
    });
    w = await app.watch.get(leyla);
    const dear = w.prices.find((p) => p.itemId === "stk_sut")!;
    expect(dear).toMatchObject({ nowKurus: 15_000, changePct: 249 });
    const latte = dear.products[0]!;
    expect([latte.marginBeforePct, latte.marginNowPct]).toEqual([80, 62]);
    // The latte cost ₺24,44 and now ₺46,20 (coffee went up too). An 80% margin again wants ₺231 on the menu, so ₺235.
    expect([latte.costBeforeKurus, latte.costNowKurus, latte.suggestedKurus]).toEqual([2_444, 4_620, 23_500]);
    expect((await app.alerts.today(leyla)).alerts.find((a) => a.type === "watch")).toMatchObject({ count: 2, names: ["Ece Tan", "Süt"], href: "/panel/gozcu" });
  });

  it("finds what's out of the ordinary, and lets it go once someone has seen it", async () => {
    let w = await app.watch.get(murat);
    expect(w.unusual).toEqual([expect.objectContaining({ kind: "voids", name: "Ece Tan", count: 4, usual: 0, href: "/kasa" })]);

    // The simit bill typed in a second time.
    const simit = {
      supplierId: "sup_seed_firin",
      date: "2026-10-15",
      lines: [{ itemId: null, name: "Simit", category: "ingredients" as const, totalKurus: 30_000 }],
    };
    const added = await app.bills.add(murat, { ...simit, key: key() });
    w = await app.watch.get(murat);
    const twice = w.unusual.find((u) => u.kind === "billTwice")!;
    expect(twice).toMatchObject({ key: `twice:bil_seed_simit:${added.id}`, name: "Fırıncı Hasan", amountKurus: 30_000, day: "2026-10-15" });

    // A ₺1.200 electricity bill against its usual ₺385… needs three before it; the demo has one, so no spike.
    expect(w.unusual.some((u) => u.kind === "billSpike")).toBe(false);

    const after = await app.watch.dismiss(leyla, { key: twice.key, note: "Fırıncı iki kez getirdi, doğru" });
    expect(after.unusual.map((u) => u.kind)).toEqual(["voids"]);
    expect(after.seen).toBe(1);
    // Seen for everyone, and twice changes nothing.
    expect((await app.watch.get(murat)).unusual.map((u) => u.kind)).toEqual(["voids"]);
    await app.watch.dismiss(murat, { key: twice.key });
    expect(await code(app.watch.dismiss(murat, { key: "twice:nope:nope" }))).toBe("WATCH_KEY");
  });

  it("flags a drawer count that was off", async () => {
    const open = (await app.cash.state(murat)).open ?? (await app.cash.open(murat, { key: key(), countKurus: 50_000 })).open!;
    await app.cash.close(murat, { key: key(), sessionId: open.id, countKurus: open.totals.expectedKurus - 8_000, note: "Bozuk para eksik" });
    const gap = (await app.watch.get(murat)).unusual.find((u) => u.kind === "cashGap");
    expect(gap).toMatchObject({ amountKurus: -8_000, name: "Murat Aksu", note: "Bozuk para eksik", day: "2026-10-16" });
  });

  it("forecasts the next 30 days from today's money, usual sales and what's due, and warns before a shortfall", async () => {
    let f = (await app.watch.get(leyla)).forecast!;
    expect(f.startKurus).toBe((await app.money.get(leyla)).totalKurus);
    expect(f.days).toHaveLength(30);
    expect(f.days[0]!.day).toBe("2026-10-16");
    expect(f.shortfall).toBeNull();
    // The rent check on its day, last month's rent again a month on, pay on the 5th.
    expect(f.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ day: "2026-10-28", kind: "check", kurus: -4_500_000 }),
        expect.objectContaining({ day: "2026-11-01", kind: "rent", label: "Dükkân kirası (tahmini)" }),
        expect.objectContaining({ day: "2026-11-05", kind: "wages" }),
      ]),
    );
    expect(f.undated).toEqual([{ label: "Murat Aksu", kurus: 34_000 }]);
    // Each day is the day before plus what comes in, less what goes out.
    for (let i = 1; i < f.days.length; i++) expect(f.days[i]!.balanceKurus).toBe(f.days[i - 1]!.balanceKurus + f.days[i]!.inKurus - f.days[i]!.outKurus);

    // A big check due next week.
    await app.debts.addCheck(murat, { key: key(), number: "0099", supplierId: "sup_seed_kahve", amountKurus: 30_000_000, dueDate: "2026-10-22" });
    f = (await app.watch.get(leyla)).forecast!;
    expect(f.shortfall?.day).toBe("2026-10-22");
    const alert = (await app.alerts.today(leyla)).alerts[0]!;
    expect(alert).toMatchObject({ type: "cashShort", level: "critical", day: "2026-10-22", href: "/panel/gozcu#nakit" });
    expect(alert.amountKurus).toBe(f.shortfall!.balanceKurus);
  });

  it("suggests what to order from each supplier, with a message to send", async () => {
    const orders = (await app.watch.get(murat)).orders!;
    const milk = orders.find((o) => o.supplierId === "sup_seed_sut")!;
    expect(milk).toMatchObject({ name: "Moda Süt", phone: "0532 410 22 18" });
    expect(milk.lines[0]).toMatchObject({ itemId: "stk_sut", unit: "l" });
    expect(milk.lines[0]!.orderMilli % 1000).toBe(0);
    expect(milk.message).toBe(`Merhaba, Moda Kahvesi için sipariş: Süt ${milk.lines[0]!.orderMilli / 1000} L. Teşekkürler.`);
    // Lemons were never on a bill.
    expect(orders.find((o) => o.supplierId === null)!.lines.map((l) => l.name)).toContain("Limon");
    // Most urgent first.
    expect(orders[0]!.lines[0]!.daysLeft).toBe(0);
  });

  it("reads next week's plan against the orders hour by hour", async () => {
    const s = (await app.watch.get(murat)).staffing!;
    expect(s).toMatchObject({ week: "2026-10-19", fromHistory: true });
    // Sundays only Murat works, 10:00 to 18:00, but the till takes orders from 08:00 to 21:00.
    const sunday = s.hints.filter((h) => h.day === "2026-10-25");
    expect(sunday.map((h) => [h.kind, h.fromHour, h.toHour])).toEqual(
      expect.arrayContaining([
        ["nobody", 8, 10],
        ["nobody", 18, 19],
      ]),
    );
    expect(s.hints.every((h) => h.kind !== "busy" || h.orders / h.people >= 8)).toBe(true);
  });

  it("is for those who see reports; each part follows its own permission", async () => {
    expect(await code(app.watch.get(await at("ece")))).toBe("FORBIDDEN");
    expect(await code(app.watch.get(await at("hakan")))).toBe("FORBIDDEN");
    expect(await code(app.watch.dismiss(await at("ece"), { key: "x" }))).toBe("FORBIDDEN");
    expect((await app.alerts.today(await at("ece"))).alerts.some((a) => a.type === "watch" || a.type === "cashShort")).toBe(false);
  });
});

describe("Monthly bills a month on", () => {
  it("lands on the same day, or the month's last", () => {
    expect(sameDayNextMonth("2026-10-01")).toBe("2026-11-01");
    expect(sameDayNextMonth("2026-01-31")).toBe("2026-02-28");
    expect(sameDayNextMonth("2026-12-15")).toBe("2027-01-15");
  });
});
