import { describe, expect, it } from "vitest";
import { costOn, InMemoryLetterStore, letterWeek, priceChanges, type Bill, type WeeklyLetter } from "../src";

type B = Pick<Bill, "id" | "date" | "lines" | "voidedAt" | "supplierId">;
const milk = (id: string, date: string, litres: number, totalKurus: number, voidedAt: Date | null = null): B => ({
  id,
  date,
  supplierId: "sup_sut",
  voidedAt,
  lines: [{ itemId: "stk_sut", name: "Süt", category: "ingredients", qtyMilli: litres * 1000, totalKurus }],
});

describe("The weekly letter's week (plan piece 30)", () => {
  it("is last Monday to Sunday, whatever day of this week it is", () => {
    expect(letterWeek("2026-10-19")).toEqual({ from: "2026-10-12", through: "2026-10-18" });
    expect(letterWeek("2026-10-25")).toEqual({ from: "2026-10-12", through: "2026-10-18" });
    expect(letterWeek("2026-10-26")).toEqual({ from: "2026-10-19", through: "2026-10-25" });
  });
});

describe("What an item cost on a day (plan piece 30)", () => {
  const bills = [milk("b1", "2026-10-03", 20, 86_000), milk("b2", "2026-10-13", 12, 54_000), milk("b3", "2026-10-15", 10, 99_000, new Date())];

  it("is the newest priced bill on or before the day, voided ones aside", () => {
    expect(costOn("stk_sut", "2026-10-11", bills, 4_000)).toEqual({ costKurus: 4_300, billId: "b1", date: "2026-10-03", supplierId: "sup_sut" });
    expect(costOn("stk_sut", "2026-10-18", bills, 4_000)).toMatchObject({ costKurus: 4_500, billId: "b2" });
  });

  it("falls back to the typed price before any bill", () => {
    expect(costOn("stk_sut", "2026-10-01", bills, 4_000)).toEqual({ costKurus: 4_000, billId: null, date: null, supplierId: null });
  });
});

describe("Price changes on a week's bills (plan piece 30)", () => {
  const items = [
    { id: "stk_sut", costKurus: 4_000 },
    { id: "stk_kahve", costKurus: 90_000 },
  ];
  const recipes = [
    {
      productId: "p_latte",
      mode: "recipe" as const,
      lines: [
        { itemId: "stk_sut", qtyMilli: 200 },
        { itemId: "stk_kahve", qtyMilli: 18 },
      ],
    },
    { productId: "p_espresso", mode: "recipe" as const, lines: [{ itemId: "stk_kahve", qtyMilli: 18 }] },
  ];
  const prices = new Map([
    ["p_latte", 12_000],
    ["p_espresso", 8_000],
  ]);
  const week = { from: "2026-10-12", through: "2026-10-18" };

  it("finds a price a bill of the week brought, with the margins of what uses it", () => {
    const bills = [milk("b1", "2026-10-03", 20, 86_000), milk("b2", "2026-10-13", 12, 54_000)];
    const [c, ...rest] = priceChanges({ ...week, bills, items, recipes, prices });
    expect(rest).toEqual([]);
    expect(c).toMatchObject({ itemId: "stk_sut", beforeKurus: 4_300, nowKurus: 4_500, changePct: 5, billId: "b2", date: "2026-10-13", supplierId: "sup_sut" });
    // Latte: 0.2 L of milk (₺8.60 → ₺9.00) and 18 g of coffee (₺16.20) on ₺120.
    expect(c!.products).toEqual([{ productId: "p_latte", marginBeforePct: 79, marginNowPct: 79 }]);
  });

  it("leaves out small moves, prices with nothing before them, and bills outside the week", () => {
    const small = [milk("b1", "2026-10-03", 20, 86_000), milk("b2", "2026-10-13", 20, 87_000)];
    expect(priceChanges({ ...week, bills: small, items, recipes, prices })).toEqual([]);
    const first = [milk("b2", "2026-10-13", 12, 54_000)];
    expect(priceChanges({ ...week, bills: first, items, recipes, prices })).toEqual([]);
    const later = [milk("b1", "2026-10-03", 20, 86_000), milk("b2", "2026-10-20", 12, 54_000)];
    expect(priceChanges({ ...week, bills: later, items, recipes, prices })).toEqual([]);
  });

  it("puts the biggest move first, cheaper ones too", () => {
    const coffee = (id: string, date: string, totalKurus: number): B => ({
      id,
      date,
      supplierId: null,
      voidedAt: null,
      lines: [{ itemId: "stk_kahve", name: "Kahve", category: "ingredients", qtyMilli: 1000, totalKurus }],
    });
    const bills = [
      milk("b1", "2026-10-03", 20, 86_000),
      milk("b2", "2026-10-13", 12, 54_000),
      coffee("c1", "2026-10-01", 100_000),
      coffee("c2", "2026-10-16", 80_000),
    ];
    const changes = priceChanges({ ...week, bills, items, recipes, prices });
    expect(changes.map((c) => [c.itemId, c.changePct])).toEqual([
      ["stk_kahve", -20],
      ["stk_sut", 5],
    ]);
    expect(changes[0]!.products.map((p) => p.productId).sort()).toEqual(["p_espresso", "p_latte"]);
    expect(changes[0]!.products.find((p) => p.productId === "p_espresso")).toEqual({ productId: "p_espresso", marginBeforePct: 78, marginNowPct: 82 });
  });
});

describe("The letter store (plan piece 30)", () => {
  const letter = (weekStart: string, headline: string): WeeklyLetter => ({
    id: `ltr_${weekStart}_${headline}`,
    cafeId: "cafe_1",
    weekStart,
    facts: { n: 1 },
    body: { headline, points: [{ title: "T", text: "X", refs: [] }], todo: { text: "Y", refs: [] }, links: {} },
    model: "demo",
    createdAt: new Date("2026-10-19T06:00:00Z"),
    emailedAt: null,
  });

  it("keeps one letter a week, newest first", async () => {
    const store = new InMemoryLetterStore();
    await store.addLetter(letter("2026-10-05", "a"));
    expect((await store.addLetter(letter("2026-10-12", "b"))).body.headline).toBe("b");
    expect((await store.addLetter(letter("2026-10-12", "c"))).body.headline).toBe("b");
    expect((await store.listLetters("cafe_1", 12)).map((l) => l.weekStart)).toEqual(["2026-10-12", "2026-10-05"]);
    await store.markEmailed("cafe_1", "2026-10-12", new Date("2026-10-19T06:01:00Z"));
    expect((await store.getLetter("cafe_1", "2026-10-12"))!.emailedAt).toEqual(new Date("2026-10-19T06:01:00Z"));
    expect(await store.getLetter("cafe_2", "2026-10-12")).toBeNull();
  });
});
