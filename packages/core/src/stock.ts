import type { Kurus } from "./money";

/**
 * Stok (plan piece 17): what a café has (ingredients and supplies), how much, and what
 * each product uses. Shelby's rules, minus its traps:
 *
 * - Amounts are whole thousandths of the unit ("milli"): 1 g of a kg item, 1 ml of a
 *   litre item, a thousandth of a piece. Sums are exact and recipes can say 18 g or
 *   200 ml of an item counted in kg or litres. No floats, no unit conversions.
 * - Every change is a move with a reason, and the item's amount only changes through
 *   moves, so the history always adds up. Moves come in batches with a key, so a sale
 *   or a count retried after a dropped connection uses stock once.
 * - A count says what is there; the store works out the difference itself, so waste
 *   can never be entered with the wrong sign (Shelby's trap).
 * - A sale is never blocked for stock: the number can go below zero, and the café sees
 *   it on Stok and Bugün. What was sold was sold.
 */

export type StockUnit = "kg" | "l" | "adet";
export const STOCK_UNITS: readonly StockUnit[] = ["kg", "l", "adet"];

/** Ingredients go into products; supplies are cups, lids, napkins. Both can be in recipes. */
export type StockKind = "ingredient" | "supply";

/** A stock item someone may start from a bill line or a drafted recipe: "Laktozsuz süt", kept in litres, an ingredient. */
export interface NewStockItem {
  name: string;
  unit: StockUnit;
  kind: StockKind;
}

/** Why a move happened. "bill" comes with Faturalar (piece 18). */
export type StockReason = "start" | "count" | "waste" | "sale" | "refund" | "bill";

/** What happened to wasted stock ("fire"). */
export type WasteWhy = "spilled" | "expired" | "broken" | "other";
export const WASTE_WHYS: readonly WasteWhy[] = ["spilled", "expired", "broken", "other"];

/** Thousandths per unit: 1 kg is 1000 milli (grams). */
export const MILLI = 1000;
/** The most an item can hold or a move can change: a million kg, litres or pieces. */
export const STOCK_MAX_MILLI = 1_000_000_000;
export const STOCK_NAME_MAX = 60;
export const STOCK_NOTE_MAX = 200;
/** Lines in one recipe. */
export const RECIPE_MAX_LINES = 20;

export interface StockItem {
  id: string;
  cafeId: string;
  name: string;
  kind: StockKind;
  unit: StockUnit;
  /** What should be there now. Can be below zero when sales ran ahead of the last count. */
  qtyMilli: number;
  /** At or below this it's "low". 0 means no warning. */
  minMilli: number;
  /** What one kg, litre or piece costs, in kuruş; null until someone enters it or a bill sets it. */
  costKurus: Kurus | null;
  /** "Stoktan kaldır": hidden, kept for history; recipes can't use it. */
  archivedAt: Date | null;
  createdAt: Date;
}

export interface StockMove {
  id: string;
  cafeId: string;
  itemId: string;
  /** Positive adds stock, negative uses it. */
  changeMilli: number;
  /** The item's amount right after this move. */
  afterMilli: number;
  reason: StockReason;
  /** For waste only. */
  why: WasteWhy | null;
  note: string | null;
  orderId: string | null;
  /** Who did it; null for sales a customer screen or terminal settled. */
  memberId: string | null;
  at: Date;
  /** The batch this move came in: one per sale, count or waste entry. */
  batchKey: string;
}

/**
 * How a product uses stock: by its recipe ("Tarifine göre"), as one counted piece
 * ("Adet olarak", a bottled drink), or not at all ("Düşmesin").
 */
export type StockMode = "recipe" | "counted" | "none";

export interface RecipeLine {
  itemId: string;
  /** Per one of the product, in thousandths of the item's unit (grams, ml, or 1000 per piece). */
  qtyMilli: number;
}

export interface Recipe {
  cafeId: string;
  productId: string;
  mode: StockMode;
  /** Counted: one line of 1 piece. None: empty. */
  lines: RecipeLine[];
}

/** One item's change in a batch: by how much, or (for a count) what is there now. */
export type StockChange = { id: string; itemId: string } & ({ changeMilli: number } | { countedMilli: number });

export interface StockBatch {
  cafeId: string;
  batchKey: string;
  reason: StockReason;
  why?: WasteWhy | null;
  note?: string | null;
  orderId?: string | null;
  memberId?: string | null;
  at: Date;
  changes: StockChange[];
}

export interface StockStore {
  /** By name. Removed items only when asked. */
  listItems(cafeId: string, opts?: { includeArchived?: boolean }): Promise<StockItem[]>;
  getItem(cafeId: string, id: string): Promise<StockItem | null>;
  /**
   * Creates the item (at its `qtyMilli`, normally 0) or updates its details. An update never
   * touches `qtyMilli`: amounts change only through `applyBatch`.
   */
  saveItem(item: StockItem): Promise<void>;
  /**
   * Applies every change of a batch together, each against the item's amount at that moment.
   * Returns the moves, or null when a batch with this key was already applied (nothing changes).
   */
  applyBatch(batch: StockBatch): Promise<StockMove[] | null>;
  /** The moves of one batch, if it was applied. */
  listBatch(cafeId: string, batchKey: string): Promise<StockMove[]>;
  /** Newest first; only these reasons when given. */
  listMoves(cafeId: string, opts: { itemId?: string; reasons?: StockReason[]; from?: Date; to?: Date; limit: number }): Promise<StockMove[]>;
  getRecipe(cafeId: string, productId: string): Promise<Recipe | null>;
  listRecipes(cafeId: string): Promise<Recipe[]>;
  saveRecipe(recipe: Recipe): Promise<void>;
}

export type StockLevel = "ok" | "low" | "out";

/** "out" at or below zero, "low" at or below its minimum, else "ok". */
export function stockLevel(item: Pick<StockItem, "qtyMilli" | "minMilli">): StockLevel {
  if (item.qtyMilli <= 0) return "out";
  if (item.minMilli > 0 && item.qtyMilli <= item.minMilli) return "low";
  return "ok";
}

/**
 * What one of a product costs from its recipe and the items' prices, in kuruş; null when
 * it isn't tracked or any item it uses has no price yet (a guess would mislead, D30).
 */
export function recipeCost(recipe: Pick<Recipe, "mode" | "lines"> | null, items: ReadonlyMap<string, Pick<StockItem, "costKurus">>): Kurus | null {
  if (!recipe || recipe.mode === "none" || recipe.lines.length === 0) return null;
  let thousandths = 0;
  for (const line of recipe.lines) {
    const cost = items.get(line.itemId)?.costKurus;
    if (cost === null || cost === undefined) return null;
    thousandths += line.qtyMilli * cost;
  }
  return Math.round(thousandths / MILLI);
}

/**
 * The stock a paid order uses, per item: each product's recipe times how many were sold.
 * `counted` is kept apart because a refund puts it back (an unopened bottle goes back on
 * the shelf); what a recipe used is gone.
 */
export function stockUse(
  lines: readonly { productId: string; quantity: number }[],
  recipes: ReadonlyMap<string, Pick<Recipe, "mode" | "lines">>,
): { recipe: Map<string, number>; counted: Map<string, number> } {
  const recipe = new Map<string, number>();
  const counted = new Map<string, number>();
  for (const line of lines) {
    const r = recipes.get(line.productId);
    if (!r || r.mode === "none") continue;
    const into = r.mode === "counted" ? counted : recipe;
    for (const l of r.lines) into.set(l.itemId, (into.get(l.itemId) ?? 0) + l.qtyMilli * line.quantity);
  }
  return { recipe, counted };
}

export type StockProblem = "NAME_EMPTY" | "NAME_TOO_LONG" | "AMOUNT_INVALID" | "COST_INVALID";

export function stockItemProblem(i: Pick<StockItem, "name" | "minMilli" | "costKurus">): StockProblem | null {
  if (!i.name.trim()) return "NAME_EMPTY";
  if (i.name.trim().length > STOCK_NAME_MAX) return "NAME_TOO_LONG";
  if (!validMilli(i.minMilli)) return "AMOUNT_INVALID";
  if (i.costKurus !== null && (!Number.isInteger(i.costKurus) || i.costKurus < 0 || i.costKurus > 10_000_000)) return "COST_INVALID";
  return null;
}

/** A whole, non-negative amount within the limit. */
export function validMilli(milli: number): boolean {
  return Number.isInteger(milli) && milli >= 0 && milli <= STOCK_MAX_MILLI;
}

export class InMemoryStockStore implements StockStore {
  private readonly items = new Map<string, StockItem>();
  private readonly moves: StockMove[] = [];
  private readonly recipes = new Map<string, Recipe>(); // `${cafeId}:${productId}`

  async listItems(cafeId: string, opts: { includeArchived?: boolean } = {}) {
    return [...this.items.values()]
      .filter((i) => i.cafeId === cafeId && (opts.includeArchived || !i.archivedAt))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      .map((i) => ({ ...i }));
  }

  async getItem(cafeId: string, id: string) {
    const i = this.items.get(id);
    return i && i.cafeId === cafeId ? { ...i } : null;
  }

  async saveItem(item: StockItem) {
    const current = this.items.get(item.id);
    this.items.set(item.id, { ...item, qtyMilli: current ? current.qtyMilli : item.qtyMilli });
  }

  async applyBatch(batch: StockBatch) {
    if (this.moves.some((m) => m.cafeId === batch.cafeId && m.batchKey === batch.batchKey)) return null;
    const out: StockMove[] = [];
    for (const change of batch.changes) {
      const item = this.items.get(change.itemId);
      if (!item || item.cafeId !== batch.cafeId) throw new Error(`No stock item ${change.itemId}`);
      const changeMilli = "countedMilli" in change ? change.countedMilli - item.qtyMilli : change.changeMilli;
      item.qtyMilli += changeMilli;
      out.push({
        id: change.id,
        cafeId: batch.cafeId,
        itemId: item.id,
        changeMilli,
        afterMilli: item.qtyMilli,
        reason: batch.reason,
        why: batch.why ?? null,
        note: batch.note ?? null,
        orderId: batch.orderId ?? null,
        memberId: batch.memberId ?? null,
        at: batch.at,
        batchKey: batch.batchKey,
      });
    }
    this.moves.push(...out);
    return out.map((m) => ({ ...m }));
  }

  async listBatch(cafeId: string, batchKey: string) {
    return this.moves.filter((m) => m.cafeId === cafeId && m.batchKey === batchKey).map((m) => ({ ...m }));
  }

  async listMoves(cafeId: string, opts: { itemId?: string; reasons?: StockReason[]; from?: Date; to?: Date; limit: number }) {
    return this.moves
      .filter(
        (m) =>
          m.cafeId === cafeId &&
          (!opts.itemId || m.itemId === opts.itemId) &&
          (!opts.reasons || opts.reasons.includes(m.reason)) &&
          (!opts.from || m.at >= opts.from) &&
          (!opts.to || m.at < opts.to),
      )
      .reverse()
      .slice(0, opts.limit)
      .map((m) => ({ ...m }));
  }

  async getRecipe(cafeId: string, productId: string) {
    const r = this.recipes.get(`${cafeId}:${productId}`);
    return r ? cloneRecipe(r) : null;
  }

  async listRecipes(cafeId: string) {
    return [...this.recipes.values()].filter((r) => r.cafeId === cafeId).map(cloneRecipe);
  }

  async saveRecipe(recipe: Recipe) {
    this.recipes.set(`${recipe.cafeId}:${recipe.productId}`, cloneRecipe(recipe));
  }
}

function cloneRecipe(r: Recipe): Recipe {
  return { ...r, lines: r.lines.map((l) => ({ ...l })) };
}
