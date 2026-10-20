import { describe, expect, it } from "vitest";
import { lineKey, packAmount, packSize, setupChecklist, setupOpen, type Bill, type BillLine } from "../src";

const now = new Date("2026-10-16T09:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("Pack sizes learned from a confirmed bill line", () => {
  it("works out one pack from what was confirmed: 2 koli as 24 l is 12 l a koli", () => {
    expect(packSize(2_000, 24_000)).toBe(12_000);
    expect(packSize(null, 24_000)).toBeNull();
    expect(packSize(2_000, null)).toBeNull();
  });

  it("converts the next bill's line the same way, only in the unit it was learned in", () => {
    const koli = { perUnitMilli: 12_000, readUnit: "koli" };
    expect(packAmount(koli, { qtyMilli: 3_000, unit: "koli" })).toBe(36_000);
    // "24 adet" of the same line isn't 288 l.
    expect(packAmount(koli, { qtyMilli: 24_000, unit: "adet" })).toBeNull();
    expect(packAmount(koli, { qtyMilli: null, unit: "koli" })).toBeNull();
    // Learned with no unit printed (or before units were kept), it holds whatever the unit.
    expect(packAmount({ perUnitMilli: 1_000, readUnit: null }, { qtyMilli: 24_000, unit: null })).toBe(24_000);
    expect(packAmount({ perUnitMilli: 1_000, readUnit: null }, { qtyMilli: 24_000, unit: "adet" })).toBe(24_000);
    expect(packAmount({ perUnitMilli: null, readUnit: null }, { qtyMilli: 24_000, unit: null })).toBeNull();
  });

  it("knows a line however it's printed", () => {
    expect(lineKey("LAKTOZSUZ SÜT 1 LT.")).toBe(lineKey("Laktozsuz süt 1 lt"));
  });
});

describe("The setup checklist on Bugün", () => {
  // Moda's menu, stock and bills as the demo seeds them, cut down to what the checklist reads.
  const products = [
    ["cay", "Çay"],
    ["turk", "Türk Kahvesi"],
    ["filtre", "Filtre Kahve"],
    ["latte", "Latte"],
    ["limonata", "Ev Limonatası"],
    ["simit", "Simit"],
    ["cheesecake", "San Sebastian"],
  ].map(([productId, name]) => ({ productId: productId!, name: name!, available: true, archivedAt: null }));
  const recipes = [
    { productId: "cay", mode: "recipe" as const, lines: [{ itemId: "stk_cay", qtyMilli: 3 }] },
    { productId: "turk", mode: "recipe" as const, lines: [{ itemId: "stk_turk", qtyMilli: 7 }, { itemId: "stk_lokum", qtyMilli: 1000 }] },
    { productId: "filtre", mode: "recipe" as const, lines: [{ itemId: "stk_filtre", qtyMilli: 15 }] },
    { productId: "latte", mode: "recipe" as const, lines: [{ itemId: "stk_espresso", qtyMilli: 18 }, { itemId: "stk_sut", qtyMilli: 200 }] },
    { productId: "limonata", mode: "recipe" as const, lines: [{ itemId: "stk_limon", qtyMilli: 150 }, { itemId: "stk_nane", qtyMilli: 200 }] },
    { productId: "simit", mode: "counted" as const, lines: [{ itemId: "stk_simit", qtyMilli: 1000 }] },
    { productId: "cheesecake", mode: "counted" as const, lines: [{ itemId: "stk_sansebastian", qtyMilli: 1000 }] },
  ];
  const items = [
    ["stk_espresso", "Espresso çekirdeği"],
    ["stk_filtre", "Filtre kahve çekirdeği"],
    ["stk_turk", "Türk kahvesi"],
    ["stk_cay", "Dökme çay"],
    ["stk_sut", "Süt"],
    ["stk_limon", "Limon"],
    ["stk_nane", "Taze nane"],
    ["stk_simit", "Simit"],
    ["stk_sansebastian", "San Sebastian dilimi"],
    ["stk_lokum", "Lokum"],
    ["stk_bardak", "Karton bardak (8 oz)"],
    ["stk_kapak", "Bardak kapağı"],
  ].map(([id, name]) => ({ id: id!, name: name!, createdAt: daysAgo(14) }));
  const bought = new Set(["stk_bardak", "stk_kapak", "stk_sut", "stk_espresso", "stk_filtre", "stk_turk", "stk_simit"]);
  const counted = new Map(items.map((i) => [i.id, daysAgo(14)]));
  const line = (l: Partial<BillLine>): BillLine => ({ itemId: null, name: "Kira Ekim", category: "rent", qtyMilli: null, totalKurus: 1_000, ...l });
  const bill = (id: string, date: string, lines: BillLine[], voidedAt: Date | null = null): Pick<Bill, "id" | "supplierId" | "date" | "lines" | "voidedAt"> => ({
    id,
    supplierId: "sup_seed_sut",
    date,
    lines,
    voidedAt,
  });
  const base = { products, recipes, items, bills: [bill("bil_seed_kira", "2026-10-01", [line({})])], bought, lastCounted: counted, now };

  it("on Moda as seeded, asks only about the five items no bill has brought", () => {
    const c = setupChecklist(base);
    expect(c).toEqual({
      noRecipe: null,
      unstocked: null,
      neverBought: { count: 5, names: ["Dökme çay", "Limon", "Taze nane", "San Sebastian dilimi", "Lokum"] },
      notCounted: null,
    });
    expect(setupOpen(c)).toBe(true);
  });

  it("counts products with no recipe out of those on the menu; 'Düşmesin' is an answer, a hidden product isn't asked about", () => {
    const c = setupChecklist({
      ...base,
      products: [...products, { productId: "kurabiye", name: "Kurabiye", available: true, archivedAt: null }, { productId: "su", name: "Su", available: true, archivedAt: null }, { productId: "eski", name: "Eski", available: false, archivedAt: null }],
      recipes: [...recipes, { productId: "su", mode: "none", lines: [] }],
    });
    expect(c.noRecipe).toEqual({ count: 1, total: 9, names: ["Kurabiye"] });
  });

  it("lists bill lines that looked like stock and reached none, newest bill first, leaving out what the café said isn't stock", () => {
    const c = setupChecklist({
      ...base,
      bills: [
        bill("bil_a", "2026-10-10", [line({ name: "Laktozsuz Süt 1 L", category: "ingredients" }), line({ name: "Süt", itemId: "stk_sut", qtyMilli: 12_000, category: "ingredients" })]),
        bill("bil_b", "2026-10-14", [line({ name: "Peçete", category: "supplies" }), line({ name: "Kasa depozitosu", category: "supplies" })]),
        bill("bil_void", "2026-10-12", [line({ name: "Krema", category: "ingredients" })], now),
      ],
      notStock: (supplierId, name) => supplierId === "sup_seed_sut" && lineKey(name) === "kasa depozitosu",
    });
    expect(c.unstocked).toEqual({
      count: 2,
      bills: [
        { id: "bil_b", supplierId: "sup_seed_sut", date: "2026-10-14", lines: ["Peçete"] },
        { id: "bil_a", supplierId: "sup_seed_sut", date: "2026-10-10", lines: ["Laktozsuz Süt 1 L"] },
      ],
    });
  });

  it("asks for a count of recipe items last counted (or added) more than 30 days ago", () => {
    const c = setupChecklist({
      ...base,
      items: [...items, { id: "stk_yeni", name: "Yeni şurup", createdAt: daysAgo(40) }, { id: "stk_taze", name: "Taze şurup", createdAt: daysAgo(3) }],
      recipes: [...recipes, { productId: "mocha", mode: "recipe", lines: [{ itemId: "stk_yeni", qtyMilli: 10 }, { itemId: "stk_taze", qtyMilli: 10 }] }],
      lastCounted: new Map([...counted, ["stk_sut", daysAgo(31)]]),
    });
    // Süt was counted 31 days ago; the new syrup was added 40 days ago and never counted; the one added 3 days ago has time.
    expect(c.notCounted).toEqual({ count: 2, names: ["Süt", "Yeni şurup"] });
  });

  it("is gone when everything is in order, and leaves out what the viewer can't see", () => {
    const c = setupChecklist({ ...base, bought: new Set(items.map((i) => i.id)) });
    expect(setupOpen(c)).toBe(false);
    expect(setupChecklist({ ...base, items: null, bills: null, products: null })).toEqual({ noRecipe: null, unstocked: null, neverBought: null, notCounted: null });
  });
});
