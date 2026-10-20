import { z } from "zod";
import { stockList, type ReadStockItem } from "./bill-reading";
import type { AiRequest } from "./model";

/**
 * Drafting a recipe: one product off the menu and the café's stock items in, what one of
 * that product uses out. Many cafés will never type their recipes; the assistant writes
 * a first go from common Turkish café measures, and a person checks and confirms it (D21).
 */

export const RECIPE_MODES = ["recipe", "counted", "none"] as const;
export type RecipeModeRead = (typeof RECIPE_MODES)[number];

export const recipeDraftingSchema = z.object({
  mode: z
    .enum(RECIPE_MODES)
    .describe(
      "recipe: made at the café from stock items (a latte, a toast). counted: sold as one bought-in piece, as it came (a bottled drink, a wrapped cake slice). none: uses no stock at all (a service, a charge, a gift card)",
    ),
  lines: z
    .array(
      z.object({
        stockItem: z.number().nullable().describe("The number of the café's stock item, from the list given; null when it is one of newItems"),
        newItem: z.number().nullable().describe("When the café doesn't have it yet: its number in newItems, counting from 1; else null"),
        amount: z
          .number()
          .describe("How much one of the product uses: in grams for an item kept in kg, in ml for an item kept in l, in pieces for an item kept in adet"),
      }),
    )
    .describe("recipe: what goes into one. counted: the one piece sold, amount 1. none: empty"),
  newItems: z
    .array(
      z.object({
        name: z.string().describe("Short, as a café would name it on its stock list: 'Karamel şurubu', 'Şişe su 500 ml'"),
        unit: z.enum(["kg", "l", "adet"]).describe("How it's kept: kg for solids and powders, l for liquids, adet for pieces"),
        kind: z.enum(["ingredient", "supply"]).describe("ingredient: goes into what is sold. supply: cups, lids, straws, napkins"),
      }),
    )
    .describe("Stock items the recipe needs that aren't in the list. Empty when the list has everything"),
  reason: z.string().nullable().describe("With none: why it uses no stock, in Turkish, one short sentence. Else null"),
  notes: z
    .array(z.string())
    .describe("Short notes in Turkish on what was assumed, one sentence each: 'Süt miktarı standart 220 ml varsayıldı.' Empty when nothing was guessed"),
});

export type RecipeDrafting = z.infer<typeof recipeDraftingSchema>;

export const RECIPE_INSTRUCTIONS = `You write a first draft of a recipe for one product on a small Turkish café's menu: what one serving uses from the café's stock. The café owner checks it before it is used, so give your best usual measure and say in "notes" what you assumed.
Use the café's own stock items whenever one fits: "Süt" is the milk for a latte, "Espresso çekirdeği" the coffee for any espresso drink. Only when nothing on the list fits, put the item in "newItems" and point to it with newItem.
Amounts are per one serving: grams for items kept in kg, ml for items kept in l, pieces for items kept in adet.
Usual measures at a Turkish café, unless the product's name or description says otherwise:
- Espresso drinks: 18 g espresso beans for a double shot (single espresso 9 g). Latte about 220 ml milk, cappuccino about 150 ml, flat white about 120 ml, cortado about 60 ml, macchiato about 20 ml. Iced drinks about 180 ml milk. Mocha adds about 20 g chocolate sauce, flavoured lattes about 20 ml syrup.
- Türk kahvesi: 7 g. Filtre kahve: 15 g for one cup. Çay: about 2 g dry tea per glass. Salep: about 20 g salep powder and 200 ml milk, with a pinch of cinnamon (about 1 g).
- Lemonade: about 150 g lemons per glass. Fresh orange juice: about 400 g oranges.
- Food that is bought ready and sold as it came (simit, a cake slice, a bottled or canned drink) is counted: mode counted, one piece of an item kept in adet.
Leave takeaway cups, lids and straws out unless the product's name says it is to go ("paket", "al götür"). Leave out water from the tap and sugar served on the side.
A service, a charge or anything with nothing physical behind it (Wi-Fi, a corkage fee, a gift card) is none, with a short reason.
Write "notes" and "reason" in Turkish, short and plain, for the café owner.`;

/** A product as the model sees it. */
export interface RecipeProduct {
  name: string;
  category: string;
  priceKurus: number;
  description?: string | null;
}

/** The request that drafts one product's recipe, with the café's stock items to use. */
export function recipeDraftingRequest(product: RecipeProduct, items: readonly ReadStockItem[]): AiRequest<RecipeDrafting> {
  const one = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);
  const price = (product.priceKurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const about = [
    `Product: ${one(product.name)}`,
    `Category: ${one(product.category) || "-"}`,
    `Price: ₺${price}`,
    product.description?.trim() ? `Description: ${one(product.description)}` : "",
  ].filter(Boolean);
  return {
    purpose: "recipe.draft",
    instructions: RECIPE_INSTRUCTIONS,
    parts: [
      { type: "text", text: about.join("\n") },
      { type: "text", text: items.length ? `Stock items:\n${stockList(items)}` : "The café has no stock items yet." },
    ],
    schema: recipeDraftingSchema,
    schemaName: "recipe_draft",
  };
}

/** The most one serving can use of one item: 2 kg or 2 litres, or 20 pieces. Anything more is a misread unit. */
export const RECIPE_LINE_MAX_MILLI = { kg: 2_000_000, l: 2_000_000, adet: 20_000 } as const;
/** Lines kept from a draft, like a recipe's own limit. */
const LINES_MAX = 20;
/** New stock items one draft may suggest. */
const NEW_ITEMS_MAX = 10;
const NAME_MAX = 60;

/** A line of a drafted recipe: one of the café's items (0-based) or one of the new ones, and how much in thousandths. */
export interface ReadRecipeLine {
  stockIndex: number | null;
  newIndex: number | null;
  qtyMilli: number;
}

export interface ReadRecipe {
  mode: RecipeModeRead;
  lines: ReadRecipeLine[];
  newItems: { name: string; unit: "kg" | "l" | "adet"; kind: "ingredient" | "supply" }[];
  reason: string | null;
  notes: string[];
}

/**
 * Turns a drafting into whole thousandths and checks what can be checked: numbers that are
 * on the lists, amounts a serving could use, one item per line, a counted product that is
 * one piece. Anything left out or changed becomes a note the owner sees.
 */
export function readRecipe(r: RecipeDrafting, items: readonly ReadStockItem[]): ReadRecipe {
  const notes = r.notes.map((n) => n.trim()).filter(Boolean);
  // New items: named, not repeating each other; each keeps a map from the model's number to ours.
  const newItems: ReadRecipe["newItems"] = [];
  const newAt = new Map<number, number>();
  for (const [n, item] of r.newItems.entries()) {
    const name = item.name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
    if (!name) continue;
    const same = newItems.findIndex((x) => x.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"));
    if (same >= 0) {
      newAt.set(n + 1, same);
      continue;
    }
    if (newItems.length >= NEW_ITEMS_MAX) continue;
    newAt.set(n + 1, newItems.length);
    newItems.push({ name, unit: item.unit, kind: item.kind });
  }
  const unitOf = (l: Omit<ReadRecipeLine, "qtyMilli">) => (l.stockIndex !== null ? items[l.stockIndex]!.unit : newItems[l.newIndex!]!.unit);
  const nameOf = (l: Omit<ReadRecipeLine, "qtyMilli">) => (l.stockIndex !== null ? items[l.stockIndex]!.name : newItems[l.newIndex!]!.name);

  let lines: ReadRecipeLine[] = [];
  if (r.mode !== "none") {
    for (const l of r.lines) {
      const s = l.stockItem;
      const ref: Omit<ReadRecipeLine, "qtyMilli"> | null =
        s !== null && Number.isInteger(s) && s >= 1 && s <= items.length
          ? { stockIndex: s - 1, newIndex: null }
          : l.newItem !== null && newAt.has(l.newItem)
            ? { stockIndex: null, newIndex: newAt.get(l.newItem)! }
            : null;
      if (!ref) {
        notes.push("Listede olmayan bir malzeme çıkarıldı.");
        continue;
      }
      const unit = unitOf(ref);
      // Grams and ml are already thousandths of a kg or litre; a piece is 1000.
      const qtyMilli = Math.round(unit === "adet" ? l.amount * 1000 : l.amount);
      if (!Number.isFinite(l.amount) || qtyMilli <= 0 || qtyMilli > RECIPE_LINE_MAX_MILLI[unit]) {
        notes.push(`${nameOf(ref)} miktarı anlaşılamadı; satır çıkarıldı.`);
        continue;
      }
      const same = lines.find((x) => x.stockIndex === ref.stockIndex && x.newIndex === ref.newIndex);
      if (same) same.qtyMilli = Math.min(same.qtyMilli + qtyMilli, RECIPE_LINE_MAX_MILLI[unit]);
      else if (lines.length < LINES_MAX) lines.push({ ...ref, qtyMilli });
    }
  }

  let mode = r.mode;
  if (mode === "counted") {
    const piece = lines.find((l) => unitOf(l) === "adet");
    if (lines.length === 1 && piece) piece.qtyMilli = 1000;
    else if (piece) {
      lines = [{ ...piece, qtyMilli: 1000 }];
      notes.push("Adet olarak satılan üründe tek bir parça bırakıldı.");
    } else {
      mode = "recipe";
      if (lines.length) notes.push("Adet olarak satılacak bir parça bulunamadı; tarif olarak yazıldı.");
    }
  }
  if (mode === "recipe" && lines.length === 0) notes.push("Asistan bu ürünün içindekileri çıkaramadı; malzemeleri sen ekle.");
  // A new item no line points to isn't needed.
  const used = new Set(lines.map((l) => l.newIndex).filter((i): i is number => i !== null));
  const keep = newItems.map((_, i) => used.has(i));
  const renumber = new Map<number, number>();
  keep.forEach((k, i) => k && renumber.set(i, renumber.size));
  return {
    mode,
    lines: lines.map((l) => (l.newIndex === null ? l : { ...l, newIndex: renumber.get(l.newIndex)! })),
    newItems: newItems.filter((_, i) => keep[i]),
    reason: mode === "none" ? r.reason?.replace(/\s+/g, " ").trim().slice(0, 200) || "Stoktan bir şey kullanmıyor." : null,
    notes: [...new Set(notes)].slice(0, 8).map((n) => n.slice(0, 200)),
  };
}
