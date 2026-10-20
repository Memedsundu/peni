import { describe, expect, it } from "vitest";
import { readRecipe, recipeDraftingRequest, ScriptedModel, type ReadStockItem, type RecipeDrafting } from "../src";

// Moda's stock (the demo café in apps/web/src/server/seed.ts), as the model is shown it.
const moda: ReadStockItem[] = [
  { name: "Bardak kapağı", unit: "adet" },
  { name: "Dökme çay", unit: "kg" },
  { name: "Espresso çekirdeği", unit: "kg" },
  { name: "Filtre kahve çekirdeği", unit: "kg" },
  { name: "Karton bardak (8 oz)", unit: "adet" },
  { name: "Limon", unit: "kg" },
  { name: "Lokum", unit: "adet" },
  { name: "San Sebastian dilimi", unit: "adet" },
  { name: "Simit", unit: "adet" },
  { name: "Süt", unit: "l" },
  { name: "Taze nane", unit: "adet" },
  { name: "Türk kahvesi", unit: "kg" },
];

const drafting = (d: Partial<RecipeDrafting>): RecipeDrafting => ({ mode: "recipe", lines: [], newItems: [], reason: null, notes: [], ...d });

describe("drafting a recipe", () => {
  it("asks with the product and Moda's numbered stock, and reads a latte back in grams and ml", async () => {
    const model = new ScriptedModel(() =>
      drafting({
        lines: [
          { stockItem: 3, newItem: null, amount: 18 },
          { stockItem: 10, newItem: null, amount: 220 },
        ],
        notes: ["Süt miktarı standart 220 ml varsayıldı."],
      }),
    );
    const request = recipeDraftingRequest({ name: "Latte", category: "Sıcak", priceKurus: 12_000, description: null }, moda);
    expect(request.purpose).toBe("recipe.draft");
    expect(request.instructions).toMatch(/18 g espresso/);
    const text = request.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    expect(text).toContain("Product: Latte\nCategory: Sıcak\nPrice: ₺120");
    expect(text).toContain("3. Espresso çekirdeği (kg)");
    expect(text).toContain("10. Süt (l)");

    const { output } = await model.run(request);
    expect(readRecipe(output, moda)).toEqual({
      mode: "recipe",
      lines: [
        { stockIndex: 2, newIndex: null, qtyMilli: 18 },
        { stockIndex: 9, newIndex: null, qtyMilli: 220 },
      ],
      newItems: [],
      reason: null,
      notes: ["Süt miktarı standart 220 ml varsayıldı."],
    });
  });

  it("reads a bottled drink as one counted piece, and suggests the item when the café doesn't keep it", () => {
    const read = readRecipe(
      drafting({
        mode: "counted",
        lines: [{ stockItem: null, newItem: 1, amount: 1 }],
        newItems: [{ name: "Şişe su 500 ml", unit: "adet", kind: "ingredient" }],
        notes: ["Moda'nın stokunda şişe su yok; yeni malzeme olarak önerildi."],
      }),
      moda,
    );
    expect(read).toMatchObject({
      mode: "counted",
      lines: [{ stockIndex: null, newIndex: 0, qtyMilli: 1000 }],
      newItems: [{ name: "Şişe su 500 ml", unit: "adet", kind: "ingredient" }],
    });
  });

  it("suggests a missing item next to the café's own ones, and drops new items no line uses", () => {
    const read = readRecipe(
      drafting({
        lines: [
          { stockItem: 3, newItem: null, amount: 18 },
          { stockItem: 10, newItem: null, amount: 200 },
          { stockItem: null, newItem: 2, amount: 20 },
        ],
        newItems: [
          { name: "Buz", unit: "kg", kind: "ingredient" },
          { name: "Karamel şurubu", unit: "l", kind: "ingredient" },
        ],
      }),
      moda,
    );
    expect(read.lines).toEqual([
      { stockIndex: 2, newIndex: null, qtyMilli: 18 },
      { stockIndex: 9, newIndex: null, qtyMilli: 200 },
      { stockIndex: null, newIndex: 0, qtyMilli: 20 },
    ]);
    expect(read.newItems).toEqual([{ name: "Karamel şurubu", unit: "l", kind: "ingredient" }]);
  });

  it("keeps a service as none with its reason, and nothing from stock", () => {
    const read = readRecipe(
      drafting({ mode: "none", lines: [{ stockItem: 2, newItem: null, amount: 2 }], reason: "Hizmet bedeli; stoktan bir şey kullanmıyor." }),
      moda,
    );
    expect(read).toEqual({ mode: "none", lines: [], newItems: [], reason: "Hizmet bedeli; stoktan bir şey kullanmıyor.", notes: [] });
    expect(readRecipe(drafting({ mode: "none", reason: "  " }), moda).reason).toBe("Stoktan bir şey kullanmıyor.");
  });

  it("leaves out numbers not on the list and amounts no serving uses, and says so", () => {
    const read = readRecipe(
      drafting({
        lines: [
          { stockItem: 99, newItem: null, amount: 10 },
          { stockItem: 10, newItem: null, amount: 0.22 * 1000 * 1000 * 10 },
          { stockItem: 2, newItem: null, amount: 2 },
          { stockItem: 2, newItem: null, amount: 1 },
        ],
      }),
      moda,
    );
    expect(read.lines).toEqual([{ stockIndex: 1, newIndex: null, qtyMilli: 3 }]);
    expect(read.notes).toEqual(["Listede olmayan bir malzeme çıkarıldı.", "Süt miktarı anlaşılamadı; satır çıkarıldı."]);
  });

  it("turns a counted product that isn't a piece into a recipe, and keeps only one piece of a counted one", () => {
    expect(readRecipe(drafting({ mode: "counted", lines: [{ stockItem: 10, newItem: null, amount: 200 }] }), moda)).toMatchObject({
      mode: "recipe",
      lines: [{ stockIndex: 9, qtyMilli: 200 }],
    });
    const two = readRecipe(
      drafting({
        mode: "counted",
        lines: [
          { stockItem: 9, newItem: null, amount: 2 },
          { stockItem: 5, newItem: null, amount: 1 },
        ],
      }),
      moda,
    );
    expect(two.lines).toEqual([{ stockIndex: 8, newIndex: null, qtyMilli: 1000 }]);
    expect(two.notes).toEqual(["Adet olarak satılan üründe tek bir parça bırakıldı."]);
  });

  it("tells the model when the café has no stock yet", () => {
    const request = recipeDraftingRequest({ name: "Salep", category: "Sıcak", priceKurus: 10_000, description: "Tarçınlı" }, []);
    const text = request.parts.map((p) => (p.type === "text" ? p.text : "")).join("\n");
    expect(text).toContain("Description: Tarçınlı");
    expect(text).toContain("The café has no stock items yet.");
  });
});
