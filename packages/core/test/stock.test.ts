import { describe, expect, it } from "vitest";
import { InMemoryStockStore, recipeCost, stockLevel, stockUse, type StockItem } from "../src";

describe("stock (plan piece 17)", () => {
  it("calls an item out at or below zero and low at or below its minimum", () => {
    expect(stockLevel({ qtyMilli: -500, minMilli: 0 })).toBe("out");
    expect(stockLevel({ qtyMilli: 0, minMilli: 1_000 })).toBe("out");
    expect(stockLevel({ qtyMilli: 1_000, minMilli: 1_000 })).toBe("low");
    expect(stockLevel({ qtyMilli: 1_001, minMilli: 1_000 })).toBe("ok");
    expect(stockLevel({ qtyMilli: 1, minMilli: 0 })).toBe("ok");
  });

  it("costs a recipe from its items' prices, and not at all while one is missing", () => {
    const items = new Map([
      ["beans", { costKurus: 90_000 }],
      ["milk", { costKurus: 4_500 }],
      ["mint", { costKurus: null }],
    ]);
    expect(recipeCost({ mode: "recipe", lines: [{ itemId: "beans", qtyMilli: 18 }, { itemId: "milk", qtyMilli: 200 }] }, items)).toBe(1_620 + 900);
    expect(recipeCost({ mode: "recipe", lines: [{ itemId: "beans", qtyMilli: 18 }, { itemId: "mint", qtyMilli: 200 }] }, items)).toBeNull();
    expect(recipeCost({ mode: "none", lines: [] }, items)).toBeNull();
    expect(recipeCost(null, items)).toBeNull();
  });

  it("adds up what an order uses, keeping counted pieces apart", () => {
    const recipes = new Map([
      ["latte", { mode: "recipe" as const, lines: [{ itemId: "milk", qtyMilli: 200 }, { itemId: "beans", qtyMilli: 18 }] }],
      ["flat", { mode: "recipe" as const, lines: [{ itemId: "milk", qtyMilli: 120 }] }],
      ["water", { mode: "counted" as const, lines: [{ itemId: "bottle", qtyMilli: 1_000 }] }],
      ["tea", { mode: "none" as const, lines: [] }],
    ]);
    const use = stockUse(
      [
        { productId: "latte", quantity: 2 },
        { productId: "flat", quantity: 1 },
        { productId: "water", quantity: 3 },
        { productId: "tea", quantity: 5 },
        { productId: "unknown", quantity: 1 },
      ],
      recipes,
    );
    expect(Object.fromEntries(use.recipe)).toEqual({ milk: 520, beans: 36 });
    expect(Object.fromEntries(use.counted)).toEqual({ bottle: 3_000 });
  });

  it("applies a batch once, counts against the amount at that moment, and never overwrites an amount with details", async () => {
    const store = new InMemoryStockStore();
    const item: StockItem = { id: "milk", cafeId: "c", name: "Süt", kind: "ingredient", unit: "l", qtyMilli: 0, minMilli: 0, costKurus: null, archivedAt: null, createdAt: new Date() };
    await store.saveItem(item);
    const at = new Date();
    expect(await store.applyBatch({ cafeId: "c", batchKey: "a", reason: "start", at, changes: [{ id: "1", itemId: "milk", changeMilli: 5_000 }] })).toHaveLength(1);
    expect(await store.applyBatch({ cafeId: "c", batchKey: "a", reason: "start", at, changes: [{ id: "2", itemId: "milk", changeMilli: 5_000 }] })).toBeNull();
    const [count] = (await store.applyBatch({ cafeId: "c", batchKey: "b", reason: "count", at, changes: [{ id: "3", itemId: "milk", countedMilli: 4_200 }] }))!;
    expect(count).toMatchObject({ changeMilli: -800, afterMilli: 4_200 });
    await store.saveItem({ ...item, name: "Tam yağlı süt" });
    expect(await store.getItem("c", "milk")).toMatchObject({ name: "Tam yağlı süt", qtyMilli: 4_200 });
    expect((await store.listMoves("c", { reasons: ["count"], limit: 5 })).map((m) => m.id)).toEqual(["3"]);
  });
});
