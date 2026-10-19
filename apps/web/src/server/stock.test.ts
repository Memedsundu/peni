import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let murat: StaffContext;
let hakan: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const qty = async (itemId: string) => (await app.stockStore.getItem("cafe_moda", itemId))!.qtyMilli;
const sellByCard = async (lines: { productId: string; quantity: number }[]) => {
  const o = await app.till.create(ece, { createKey: key(), lines });
  const started = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
  return (await app.till.confirmPayment(ece, o.id, started.payment.id)).order;
};

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  [leyla, murat, hakan, ece] = await Promise.all([at("leyla"), at("murat"), at("hakan"), at("ece")]);
});

describe("Stok (plan piece 17)", () => {
  it("lists what is out first, then low, with what uses each item and the waste it cost", async () => {
    const view = await app.stock.view(murat);
    expect(view.items.slice(0, 4).map((i) => [i.name, i.level])).toEqual([
      ["San Sebastian dilimi", "out"],
      ["Limon", "low"],
      ["Simit", "low"],
      ["Süt", "low"],
    ]);
    expect(view.items.find((i) => i.id === "stk_sut")).toMatchObject({ unit: "l", qtyMilli: 2_100, minMilli: 5_000, usedBy: ["Latte"], unitLocked: true });
    expect(view.items.find((i) => i.id === "stk_bardak")).toMatchObject({ kind: "supply", usedBy: [], level: "ok" });
    // Sales stay in each item's own history; the page lists counts and waste.
    expect(view.moves.map((m) => m.reason)).not.toContain("sale");
    expect(view.moves[0]).toMatchObject({ reason: "waste", why: "broken", note: "Vitrinden düştü", by: "Ece Tan", itemName: "San Sebastian dilimi", valueKurus: 6_500 });
    // 2 L of milk at ₺45 and a slice at ₺65.
    expect(view.wasteKurus).toBe(9_000 + 6_500);
    expect(view.canEdit).toBe(true);
  });

  it("lets the back of house see stock, and nobody else", async () => {
    expect(await code(app.stock.view(hakan))).toBe("ok");
    expect(await code(app.stock.view(ece))).toBe("FORBIDDEN");
    expect(await code(app.stock.count(ece, { key: key(), counts: [{ itemId: "stk_sut", countedMilli: 1_000 }] }))).toBe("FORBIDDEN");
  });

  it("adds an item with what is there, once however often the tap is retried, and keeps names unique", async () => {
    const input = { key: key(), name: "Yulaf sütü", kind: "ingredient" as const, unit: "l" as const, startMilli: 6_000, minMilli: 2_000, costKurus: 9_500 };
    await app.stock.addItem(murat, input);
    const view = await app.stock.addItem(murat, input);
    expect(view.items.filter((i) => i.name === "Yulaf sütü")).toEqual([expect.objectContaining({ qtyMilli: 6_000, level: "ok", unitLocked: false, countedAt: null })]);
    expect(await code(app.stock.addItem(murat, { ...input, key: key(), name: " yulaf SÜTÜ " }))).toBe("STOCK_ITEM_EXISTS");
    expect(await code(app.stock.addItem(murat, { ...input, key: key(), name: "Kakao", costKurus: -1 }))).toBe("COST_INVALID");
  });

  it("counts what is there and records the difference, whatever sold in between", async () => {
    const countKey = key();
    const before = await qty("stk_espresso");
    await app.stock.count(murat, { key: countKey, counts: [{ itemId: "stk_espresso", countedMilli: 1_200 }, { itemId: "stk_sut", countedMilli: 3_000 }], note: "Akşam sayımı" });
    await app.stock.count(murat, { key: countKey, counts: [{ itemId: "stk_espresso", countedMilli: 9_999 }] });
    expect(await qty("stk_espresso")).toBe(1_200);
    const history = await app.stock.history(murat, "stk_espresso");
    expect(history.moves[0]).toMatchObject({ reason: "count", changeMilli: 1_200 - before, afterMilli: 1_200, note: "Akşam sayımı", by: "Murat Aksu" });
    expect(history.item.countedAt).toBe(now.toISOString());
    expect(await code(app.stock.count(murat, { key: key(), counts: [{ itemId: "stk_sut", countedMilli: 1 }, { itemId: "stk_sut", countedMilli: 2 }] }))).toBe("VALIDATION");
    expect(await code(app.stock.count(murat, { key: key(), counts: [{ itemId: "stk_yok", countedMilli: 1 }] }))).toBe("STOCK_ITEM_NOT_FOUND");
  });

  it("records waste as stock going out, with why", async () => {
    await app.stock.waste(murat, { key: key(), itemId: "stk_sut", qtyMilli: 500, why: "spilled" });
    expect(await qty("stk_sut")).toBe(1_600);
    expect(await code(app.stock.waste(murat, { key: key(), itemId: "stk_sut", qtyMilli: 500, why: "other" }))).toBe("WASTE_NOTE_REQUIRED");
    expect(await code(app.stock.waste(murat, { key: key(), itemId: "stk_sut", qtyMilli: 0, why: "spilled" }))).toBe("QTY_INVALID");
  });

  it("fixes an item's unit once it's in use, and keeps an item a recipe uses", async () => {
    expect(await code(app.stock.updateItem(murat, "stk_sut", { unit: "kg" }))).toBe("STOCK_UNIT_LOCKED");
    expect(await code(app.stock.updateItem(murat, "stk_sut", { removed: true }))).toBe("STOCK_ITEM_IN_USE");
    const view = await app.stock.updateItem(murat, "stk_kapak", { removed: true, minMilli: 0 });
    expect(view.removed.map((i) => i.name)).toEqual(["Bardak kapağı"]);
    expect(await code(app.stock.count(murat, { key: key(), counts: [{ itemId: "stk_kapak", countedMilli: 1 }] }))).toBe("STOCK_ITEM_NOT_FOUND");
    expect((await app.stock.updateItem(murat, "stk_kapak", { removed: false })).items.map((i) => i.id)).toContain("stk_kapak");
  });
});

describe("recipes and sales (plan piece 17)", () => {
  it("uses stock by recipe when an order is paid, once, and never refuses a sale", async () => {
    const [milk, beans, slices] = [await qty("stk_sut"), await qty("stk_espresso"), await qty("stk_sansebastian")];
    // The cheesecake is already out: it sells anyway, and Stok shows it below zero.
    const order = await sellByCard([{ productId: "latte", quantity: 2 }, { productId: "cheesecake", quantity: 1 }]);
    expect(order.status).toBe("paid");
    expect(await qty("stk_sut")).toBe(milk - 400);
    expect(await qty("stk_espresso")).toBe(beans - 36);
    expect(await qty("stk_sansebastian")).toBe(slices - 1_000);
    expect((await app.stock.view(murat)).items[0]).toMatchObject({ id: "stk_sansebastian", qtyMilli: -1_000, level: "out" });
    const history = await app.stock.history(murat, "stk_sut");
    expect(history.moves[0]).toMatchObject({ reason: "sale", changeMilli: -400, by: "Ece Tan" });
  });

  it("puts counted products back on a refund, and leaves what a recipe used", async () => {
    const [milk, slices] = [await qty("stk_sut"), await qty("stk_sansebastian")];
    const order = await sellByCard([{ productId: "latte", quantity: 1 }, { productId: "cheesecake", quantity: 2 }]);
    await app.till.refund(leyla, order.id, { reason: "Yanlış sipariş" });
    expect(await qty("stk_sansebastian")).toBe(slices);
    expect(await qty("stk_sut")).toBe(milk - 200);
  });

  it("uses nothing for what a guest leaves on the askı, until it's given out", async () => {
    const tea = await qty("stk_cay");
    await sellByCard([{ productId: "askida:cay", quantity: 3 }]);
    expect(await qty("stk_cay")).toBe(tea);
  });

  it("shows each product's cost from its recipe, and none while an item has no price (D30)", async () => {
    const { recipes, items } = await app.stock.recipes(hakan);
    const of = (id: string) => recipes.find((r) => r.productId === id)!;
    // 18 g at ₺900/kg and 200 ml at ₺45/L.
    expect(of("latte")).toMatchObject({ name: "Latte", priceKurus: 12_000, mode: "recipe", costKurus: 1_620 + 900, unpriced: [] });
    expect(of("simit")).toMatchObject({ mode: "counted", costKurus: 1_000 });
    expect(of("limonata")).toMatchObject({ costKurus: null, unpriced: ["Taze nane"] });
    expect(items.map((i) => i.name)).toContain("Karton bardak (8 oz)");
    expect(await code(app.stock.recipes(ece))).toBe("FORBIDDEN");
  });

  it("checks a recipe before keeping it", async () => {
    const save = (mode: "recipe" | "counted" | "none", lines: { itemId: string; qtyMilli: number }[]) => code(app.stock.saveRecipe(hakan, "filtre", { mode, lines }));
    expect(await save("recipe", [])).toBe("RECIPE_EMPTY");
    expect(await save("recipe", [{ itemId: "stk_filtre", qtyMilli: 15 }, { itemId: "stk_filtre", qtyMilli: 3 }])).toBe("RECIPE_DUPLICATE");
    expect(await save("counted", [{ itemId: "stk_filtre", qtyMilli: 1_000 }])).toBe("RECIPE_COUNTED_ONE");
    expect(await save("recipe", [{ itemId: "stk_yok", qtyMilli: 1 }])).toBe("STOCK_ITEM_NOT_FOUND");
    expect(await code(app.stock.saveRecipe(hakan, "yok", { mode: "none", lines: [] }))).toBe("PRODUCT_NOT_FOUND");

    const saved = await app.stock.saveRecipe(hakan, "filtre", { mode: "recipe", lines: [{ itemId: "stk_filtre", qtyMilli: 15 }, { itemId: "stk_bardak", qtyMilli: 1_000 }] });
    expect(saved.recipes.find((r) => r.productId === "filtre")).toMatchObject({ costKurus: 1_650 + 250 });
    const off = await app.stock.saveRecipe(hakan, "filtre", { mode: "none", lines: [{ itemId: "stk_filtre", qtyMilli: 15 }] });
    expect(off.recipes.find((r) => r.productId === "filtre")).toMatchObject({ mode: "none", lines: [], costKurus: null });
    const beans = await qty("stk_filtre");
    await sellByCard([{ productId: "filtre", quantity: 1 }]);
    expect(await qty("stk_filtre")).toBe(beans);
  });

  it("puts what's low on Bugün for those who see stock", async () => {
    const low = (await app.staffDashboard(murat)).lowStock!;
    expect(low.map((i) => [i.name, i.level])).toEqual([
      ["San Sebastian dilimi", "out"],
      ["Limon", "low"],
      ["Simit", "low"],
      ["Süt", "low"],
    ]);
    expect((await app.staffDashboard(ece)).lowStock).toBeNull();
    // Kuzguncuk hasn't set stock up: nothing to say.
    expect((await app.staffDashboard(await at("tarik", "kuzguncuk"))).lowStock).toEqual([]);
  });
});
