import { AiError, ScriptedModel, type AiRequest, type RecipeDrafting } from "@peni/ai";
import { RECIPE_DRAFTS_PER_DAY, type MenuItem } from "@peni/core";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let answer: (request: AiRequest<unknown>) => unknown;
let model: ScriptedModel;
let leyla: StaffContext;

const at = async (a: PeniApp, who: keyof typeof DEMO_STAFF, slug = "moda") =>
  a.staff.at((await a.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
/** The number Moda's stock list gives an item, as the model sees it. */
const numberOf = (r: AiRequest<unknown>, name: string) => {
  const text = r.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  const m = new RegExp(`^(\\d+)\\. ${name} \\(`, "m").exec(text);
  if (!m) throw new Error(`${name} isn't on the list`);
  return Number(m[1]);
};
const productOf = (r: AiRequest<unknown>) => /^Product: (.*)$/m.exec(r.parts[0]!.type === "text" ? r.parts[0]!.text : "")?.[1];
const drafting = (d: Partial<RecipeDrafting>): RecipeDrafting => ({ mode: "recipe", lines: [], newItems: [], reason: null, notes: [], ...d });

/** Products Moda adds to its menu after the seed; none has a recipe yet. */
const NEW: (Omit<MenuItem, "categoryId" | "sortOrder" | "category"> & { categoryId: string })[] = [
  { productId: "buzlu-latte", name: "Buzlu Latte", categoryId: "cat_moda_2", priceKurus: 13_000, available: true, description: null },
  { productId: "su", name: "Şişe Su", categoryId: "cat_moda_2", priceKurus: 3_000, available: true, description: "500 ml" },
  { productId: "karamel-latte", name: "Karamel Latte", categoryId: "cat_moda_1", priceKurus: 14_000, available: true, description: null },
];

/** What a Turkish café's usual measures give for each, the way Claude answers. */
function usual(r: AiRequest<unknown>): RecipeDrafting {
  switch (productOf(r)) {
    case "Buzlu Latte":
      return drafting({
        lines: [
          { stockItem: numberOf(r, "Espresso çekirdeği"), newItem: null, amount: 18 },
          { stockItem: numberOf(r, "Süt"), newItem: null, amount: 180 },
        ],
        notes: ["Buzlu içecekte süt 180 ml varsayıldı; buz stokta tutulmuyor."],
      });
    case "Şişe Su":
      return drafting({
        mode: "counted",
        lines: [{ stockItem: null, newItem: 1, amount: 1 }],
        newItems: [{ name: "Şişe su 500 ml", unit: "adet", kind: "ingredient" }],
        notes: ["Stokta şişe su yok; yeni malzeme olarak önerildi."],
      });
    case "Karamel Latte":
      return drafting({
        lines: [
          { stockItem: numberOf(r, "Espresso çekirdeği"), newItem: null, amount: 18 },
          { stockItem: numberOf(r, "Süt"), newItem: null, amount: 220 },
          { stockItem: null, newItem: 1, amount: 20 },
        ],
        newItems: [{ name: "Karamel şurubu", unit: "l", kind: "ingredient" }],
        notes: ["Süt miktarı standart 220 ml varsayıldı."],
      });
    default:
      return drafting({ mode: "none", reason: "Bilinmiyor." });
  }
}

async function makeApp(ai: ConstructorParameters<typeof PeniApp>[0]["ai"]) {
  stores = inMemoryStores();
  const a = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, ai }, stores);
  await seed(a, { drafts: false });
  for (const [i, p] of NEW.entries()) await a.menu.saveProduct("cafe_moda", { ...p, category: "", sortOrder: 10 + i });
  return a;
}

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  answer = usual;
  model = new ScriptedModel((r) => answer(r), "test-model");
  app = await makeApp({ model, mode: "on" });
  leyla = await at(app, "leyla");
});

const recipeOf = async (productId: string) => (await app.stock.recipes(leyla)).recipes.find((r) => r.productId === productId)!;
const events = async () => (await app.assistant.log(leyla)).events;

describe("recipe drafts in Menü (D21)", () => {
  it("offers only the products with no recipe; Moda's own seven all have one", async () => {
    const list = await app.recipeDrafts.list(leyla);
    expect(list).toMatchObject({ drafts: [], missing: ["karamel-latte", "buzlu-latte", "su"], ai: "on", left: RECIPE_DRAFTS_PER_DAY, canAddItems: true });
    // The seeded latte has its recipe: the assistant never writes over it, and isn't even asked.
    expect(await code(app.recipeDrafts.draft(leyla, "latte"))).toBe("RECIPE_EXISTS");
    expect(model.calls).toHaveLength(0);
  });

  it("drafts a latte from Moda's stock, shows what it would cost, and saves it only when confirmed", async () => {
    const list = await app.recipeDrafts.draft(leyla, "buzlu-latte");
    const request = model.calls[0]!;
    expect(request.purpose).toBe("recipe.draft");
    expect(request.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n")).toMatch(/Product: Buzlu Latte\nCategory: Soğuk\nPrice: ₺130/);
    const [draft] = list.drafts;
    // 18 g of beans at ₺900/kg and 180 ml of milk at ₺45/l: ₺16,20 + ₺8,10.
    expect(draft).toMatchObject({
      productName: "Buzlu Latte",
      mode: "recipe",
      lines: [
        { itemId: "stk_espresso", newItem: null, qtyMilli: 18 },
        { itemId: "stk_sut", newItem: null, qtyMilli: 180 },
      ],
      newItems: [],
      costKurus: 2_430,
      unpriced: [],
      notes: ["Buzlu içecekte süt 180 ml varsayıldı; buz stokta tutulmuyor."],
    });
    expect(list.missing).toEqual(["karamel-latte", "su"]);
    // Still a draft: Menü shows nothing taken from stock yet.
    expect(await recipeOf("buzlu-latte")).toMatchObject({ mode: "none", lines: [], costKurus: null });
    expect(await app.stockStore.getRecipe("cafe_moda", "buzlu-latte")).toBeNull();

    // Asking again keeps the draft there is; the model isn't asked twice.
    await app.recipeDrafts.draft(leyla, "buzlu-latte");
    expect(model.calls).toHaveLength(1);

    const saved = await app.recipeDrafts.confirm(leyla, draft!.id, { mode: draft!.mode, lines: draft!.lines, newItems: draft!.newItems });
    expect(saved.recipes.find((r) => r.productId === "buzlu-latte")).toMatchObject({ mode: "recipe", costKurus: 2_430 });
    expect((await app.recipeDrafts.list(leyla)).drafts).toEqual([]);
    // Confirming twice saves it once.
    await app.recipeDrafts.confirm(leyla, draft!.id, { mode: "recipe", lines: draft!.lines, newItems: [] });

    const log = await events();
    expect(log.map((e) => [e.kind, e.purpose, e.detail]).slice(0, 3)).toEqual([
      ["draft.confirmed", null, "Reçete · Buzlu Latte"],
      ["draft.created", null, "Reçete · Buzlu Latte"],
      ["ai.call", "recipe.draft", "Buzlu Latte"],
    ]);
    expect(log[2]).toMatchObject({ model: "test-model", ok: true, who: "Leyla Kara" });
  });

  it("drafts a bottled drink as one counted piece, and adds the bottle to Stok when confirmed", async () => {
    const [draft] = (await app.recipeDrafts.draft(leyla, "su")).drafts;
    expect(draft).toMatchObject({
      mode: "counted",
      lines: [{ itemId: null, newItem: 0, qtyMilli: 1000 }],
      newItems: [{ name: "Şişe su 500 ml", unit: "adet", kind: "ingredient" }],
      costKurus: null,
      unpriced: ["Şişe su 500 ml"],
    });
    // A barista doesn't edit recipes.
    expect(await code(app.recipeDrafts.confirm(await at(app, "ece"), draft!.id, draft!))).toBe("FORBIDDEN");

    // The chef edits recipes and stock, so can add the new item too.
    const hakan = await at(app, "hakan");
    await app.recipeDrafts.confirm(hakan, draft!.id, { mode: "counted", lines: draft!.lines, newItems: draft!.newItems });
    const bottle = (await app.stockStore.listItems("cafe_moda")).find((i) => i.name === "Şişe su 500 ml")!;
    expect(bottle).toMatchObject({ unit: "adet", kind: "ingredient", qtyMilli: 0, costKurus: null });
    expect(await app.stockStore.getRecipe("cafe_moda", "su")).toEqual({
      cafeId: "cafe_moda",
      productId: "su",
      mode: "counted",
      lines: [{ itemId: bottle.id, qtyMilli: 1000 }],
    });
    // Its cost waits for the first bill with a price.
    expect(await recipeOf("su")).toMatchObject({ mode: "counted", costKurus: null, unpriced: ["Şişe su 500 ml"] });
  });

  it("suggests a stock item the café doesn't have, and keeps what the owner changed before confirming", async () => {
    const [draft] = (await app.recipeDrafts.draft(leyla, "karamel-latte")).drafts;
    expect(draft!.newItems).toEqual([{ name: "Karamel şurubu", unit: "l", kind: "ingredient" }]);
    expect(draft!.lines[2]).toEqual({ itemId: null, newItem: 0, qtyMilli: 20 });
    expect(draft!.unpriced).toEqual(["Karamel şurubu"]);

    // Leyla pours 200 ml of milk, not 220.
    const lines = draft!.lines.map((l) => (l.itemId === "stk_sut" ? { ...l, qtyMilli: 200 } : l));
    await app.recipeDrafts.confirm(leyla, draft!.id, { mode: "recipe", lines, newItems: draft!.newItems });
    const syrup = (await app.stockStore.listItems("cafe_moda")).find((i) => i.name === "Karamel şurubu")!;
    expect((await app.stockStore.getRecipe("cafe_moda", "karamel-latte"))!.lines).toEqual([
      { itemId: "stk_espresso", qtyMilli: 18 },
      { itemId: "stk_sut", qtyMilli: 200 },
      { itemId: syrup.id, qtyMilli: 20 },
    ]);
    expect((await events())[0]).toMatchObject({ kind: "draft.confirmed", detail: "Reçete · Karamel Latte · değişti: malzemeler" });
  });

  it("leaves the product as it was when the draft is let go", async () => {
    const [draft] = (await app.recipeDrafts.draft(leyla, "karamel-latte")).drafts;
    const itemsBefore = await app.stockStore.listItems("cafe_moda");
    const list = await app.recipeDrafts.dismiss(leyla, draft!.id, { reason: "Şurubu kendimiz yapıyoruz" });
    expect(list.drafts).toEqual([]);
    expect(list.missing).toContain("karamel-latte");
    expect(await app.stockStore.getRecipe("cafe_moda", "karamel-latte")).toBeNull();
    expect(await recipeOf("karamel-latte")).toMatchObject({ mode: "none", lines: [], costKurus: null });
    // Nothing was added to Stok: the syrup was only a suggestion.
    expect(await app.stockStore.listItems("cafe_moda")).toEqual(itemsBefore);
    expect(await code(app.recipeDrafts.confirm(leyla, draft!.id, draft!))).toBe("DRAFT_DECIDED");
    expect((await events())[0]).toMatchObject({ kind: "draft.dismissed", detail: "Reçete · Karamel Latte · Şurubu kendimiz yapıyoruz" });
  });

  it("never writes over a recipe someone saved while the draft waited", async () => {
    const [draft] = (await app.recipeDrafts.draft(leyla, "buzlu-latte")).drafts;
    await app.stock.saveRecipe(leyla, "buzlu-latte", { mode: "recipe", lines: [{ itemId: "stk_espresso", qtyMilli: 20 }] });
    expect((await app.recipeDrafts.list(leyla)).drafts).toEqual([]);
    expect(await code(app.recipeDrafts.confirm(leyla, draft!.id, draft!))).toBe("RECIPE_EXISTS");
    expect((await app.stockStore.getRecipe("cafe_moda", "buzlu-latte"))!.lines).toEqual([{ itemId: "stk_espresso", qtyMilli: 20 }]);
    // A saved "Düşmesin" is a decision too: nothing is offered for it.
    await app.stock.saveRecipe(leyla, "su", { mode: "none", lines: [] });
    expect((await app.recipeDrafts.list(leyla)).missing).toEqual(["karamel-latte"]);
    expect(await code(app.recipeDrafts.draft(leyla, "su"))).toBe("RECIPE_EXISTS");
  });

  it("checks a confirmed recipe like Menü does before adding anything to Stok", async () => {
    const [draft] = (await app.recipeDrafts.draft(leyla, "su")).drafts;
    const before = (await app.stockStore.listItems("cafe_moda")).length;
    // Counted means one item kept in pieces; a litre item can't be.
    expect(
      await code(app.recipeDrafts.confirm(leyla, draft!.id, { mode: "counted", lines: draft!.lines, newItems: [{ name: "Şişe su", unit: "l", kind: "ingredient" }] })),
    ).toBe("RECIPE_COUNTED_ONE");
    expect(await code(app.recipeDrafts.confirm(leyla, draft!.id, { mode: "recipe", lines: [], newItems: [] }))).toBe("RECIPE_EMPTY");
    // A new item named like one Moda has, in another unit, is a mistake rather than a second milk.
    expect(
      await code(
        app.recipeDrafts.confirm(leyla, draft!.id, {
          mode: "recipe",
          lines: [{ itemId: null, newItem: 0, qtyMilli: 200 }],
          newItems: [{ name: "süt", unit: "kg", kind: "ingredient" }],
        }),
      ),
    ).toBe("STOCK_ITEM_EXISTS");
    expect((await app.stockStore.listItems("cafe_moda")).length).toBe(before);
    // In the same unit, it's Moda's own Süt.
    await app.recipeDrafts.confirm(leyla, draft!.id, {
      mode: "recipe",
      lines: [{ itemId: null, newItem: 0, qtyMilli: 200 }],
      newItems: [{ name: "Süt", unit: "l", kind: "ingredient" }],
    });
    expect((await app.stockStore.getRecipe("cafe_moda", "su"))!.lines).toEqual([{ itemId: "stk_sut", qtyMilli: 200 }]);
    expect((await app.stockStore.listItems("cafe_moda")).length).toBe(before);
  });

  it("says the assistant is off when there's no model, and logs a call that failed", async () => {
    const off = await makeApp({ model: null, mode: "off" });
    const owner = await at(off, "leyla");
    expect(await code(off.recipeDrafts.draft(owner, "buzlu-latte"))).toBe("RECIPE_AI_OFF");
    expect((await off.recipeDrafts.list(owner)).ai).toBe("off");

    answer = () => {
      throw new AiError("AI_UNAVAILABLE", "Anthropic answered 529", { inputTokens: 300, outputTokens: 0 });
    };
    expect(await code(app.recipeDrafts.draft(leyla, "buzlu-latte"))).toBe("RECIPE_DRAFT_FAILED");
    expect((await events())[0]).toMatchObject({ kind: "ai.call", purpose: "recipe.draft", ok: false, inputTokens: 300, detail: "Anthropic answered 529" });
    expect((await app.recipeDrafts.list(leyla)).missing).toContain("buzlu-latte");
  });

  it("keeps to the day's limit", async () => {
    for (let i = 0; i < RECIPE_DRAFTS_PER_DAY; i++) {
      await stores.recipeDrafts.saveRecipeDraft({
        id: `rcd_old_${i}`,
        cafeId: "cafe_moda",
        productId: "cay",
        productName: "Çay",
        status: "dismissed",
        proposal: { mode: "none", lines: [], newItems: [], reason: null },
        notes: [],
        model: "test-model",
        createdById: leyla.member.id,
        createdAt: new Date(now.getTime() - 60_000),
        decidedById: null,
        decidedAt: null,
        changed: [],
        dismissReason: null,
      });
    }
    expect((await app.recipeDrafts.list(leyla)).left).toBe(0);
    expect(await code(app.recipeDrafts.draft(leyla, "buzlu-latte"))).toBe("RECIPE_DRAFT_LIMIT");
    expect(model.calls).toHaveLength(0);
    // Tomorrow is a new day.
    now = new Date(now.getTime() + 24 * 3_600_000);
    expect(await code(app.recipeDrafts.draft(leyla, "buzlu-latte"))).toBe("ok");
  });

  it("drafts Kuzguncuk's salep with the demo's stand-in, suggesting every item since it has no stock yet", async () => {
    const demo = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
    await seed(demo, { drafts: false });
    const tarik = await at(demo, "tarik", "kuzguncuk");
    expect((await demo.recipeDrafts.list(tarik)).missing).toEqual(["cay", "turk", "sahlep", "pogaca"]);
    const [draft] = (await demo.recipeDrafts.draft(tarik, "sahlep")).drafts;
    expect(draft).toMatchObject({
      mode: "recipe",
      lines: [
        { itemId: null, newItem: 0, qtyMilli: 20 },
        { itemId: null, newItem: 1, qtyMilli: 200 },
        { itemId: null, newItem: 2, qtyMilli: 1 },
      ],
      newItems: [
        { name: "Salep tozu", unit: "kg" },
        { name: "Süt", unit: "l" },
        { name: "Tarçın", unit: "kg" },
      ],
    });
    expect(draft!.notes.at(-1)).toMatch(/^Demo:/);
    const pogaca = (await demo.recipeDrafts.draft(tarik, "pogaca")).drafts.find((d) => d.productId === "pogaca");
    expect(pogaca).toMatchObject({ mode: "counted", newItems: [{ name: "Peynirli Poğaça", unit: "adet" }] });
  });
});
