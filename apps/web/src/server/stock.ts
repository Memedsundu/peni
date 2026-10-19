import type { RecipeDTO, RecipesDTO, StockDTO, StockItemDTO, StockItemHistoryDTO, StockMoveDTO } from "@peni/api";
import {
  MILLI,
  recipeCost,
  sameMenuName,
  stockItemProblem,
  stockLevel,
  stockUse,
  type MenuStore,
  type Order,
  type Permission,
  type Recipe,
  type StaffStore,
  type StockBatch,
  type StockItem,
  type StockKind,
  type StockMode,
  type StockMove,
  type StockProblem,
  type StockReason,
  type StockStore,
  type StockUnit,
  type WasteWhy,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

const DAY_MS = 86_400_000;
/** Moves the Stok page lists; sales are in each item's own history, or they'd bury the rest. */
const PAGE_REASONS: StockReason[] = ["start", "count", "waste", "refund", "bill"];
const PAGE_MOVES = 12;

/**
 * Stok and recipes (plan piece 17). The café keeps a list of what it has, counts it now
 * and then, records waste, and says how each product uses stock. Paid sales use stock by
 * those recipes; a refund puts back only counted products (an unopened bottle), since what
 * a recipe used is gone. Nothing here ever stops a sale.
 */
export class StockService {
  constructor(
    private readonly store: StockStore,
    private readonly menu: MenuStore,
    private readonly staff: StaffStore,
    private readonly now: () => Date,
  ) {}

  // ─────────────────────────────────────────────── Stok

  async view(ctx: StaffContext): Promise<StockDTO> {
    this.require(ctx, "stock.view");
    const cafeId = ctx.cafe.id;
    const [items, recipes, products, moves] = await Promise.all([
      this.store.listItems(cafeId, { includeArchived: true }),
      this.store.listRecipes(cafeId),
      this.menu.listMenu(cafeId),
      this.store.listMoves(cafeId, { reasons: PAGE_REASONS, limit: 500 }),
    ]);
    const usedBy = usedByNames(recipes, products);
    const countedAt = new Map<string, Date>();
    const touched = new Set<string>();
    for (const m of moves) {
      if (m.reason === "count" && !countedAt.has(m.itemId)) countedAt.set(m.itemId, m.at);
      if (m.reason !== "start") touched.add(m.itemId);
    }
    const inRecipe = new Set(recipes.flatMap((r) => r.lines.map((l) => l.itemId)));
    const dto = (i: StockItem) =>
      itemDTO(i, usedBy.get(i.id) ?? [], countedAt.get(i.id) ?? null, touched.has(i.id) || inRecipe.has(i.id));
    const live = items.filter((i) => !i.archivedAt).map(dto);
    const since = this.now().getTime() - 30 * DAY_MS;
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      items: live.sort(worstFirst),
      removed: items.filter((i) => i.archivedAt).map(dto),
      moves: await this.moveDTOs(moves.slice(0, PAGE_MOVES), byId),
      wasteKurus: Math.round(
        moves
          .filter((m) => m.reason === "waste" && m.at.getTime() >= since)
          .reduce((s, m) => s + (-m.changeMilli * (byId.get(m.itemId)?.costKurus ?? 0)) / MILLI, 0),
      ),
      canEdit: ctx.permissions.has("stock.edit"),
    };
  }

  /** One item with every move it had, sales included. */
  async history(ctx: StaffContext, itemId: string): Promise<StockItemHistoryDTO> {
    this.require(ctx, "stock.view");
    const item = await this.item(ctx, itemId);
    const [moves, recipes, products] = await Promise.all([
      this.store.listMoves(ctx.cafe.id, { itemId, limit: 200 }),
      this.store.listRecipes(ctx.cafe.id),
      this.menu.listMenu(ctx.cafe.id),
    ]);
    const countedAt = moves.find((m) => m.reason === "count")?.at ?? null;
    const locked = moves.some((m) => m.reason !== "start") || recipes.some((r) => r.lines.some((l) => l.itemId === itemId));
    return {
      item: itemDTO(item, usedByNames(recipes, products).get(itemId) ?? [], countedAt, locked),
      moves: await this.moveDTOs(moves, new Map([[item.id, item]])),
    };
  }

  /** Out or low, worst first, for Bugün. Items nobody uses and with no minimum aren't news. */
  async lowStock(cafeId: string): Promise<{ id: string; name: string; unit: StockUnit; qtyMilli: number; minMilli: number; level: "low" | "out" }[]> {
    const [items, recipes, products] = await Promise.all([this.store.listItems(cafeId), this.store.listRecipes(cafeId), this.menu.listMenu(cafeId)]);
    const usedBy = usedByNames(recipes, products);
    return items
      .map((i) => ({ i, level: stockLevel(i) }))
      .filter(({ i, level }) => level !== "ok" && (i.minMilli > 0 || usedBy.has(i.id)))
      .map(({ i, level }) => ({ id: i.id, name: i.name, unit: i.unit, qtyMilli: i.qtyMilli, minMilli: i.minMilli, level: level as "low" | "out" }))
      .sort(worstFirst);
  }

  /** "Malzeme ekle", with what is there now. The same `key` twice adds it once. */
  async addItem(
    ctx: StaffContext,
    input: { key: string; name: string; kind: StockKind; unit: StockUnit; startMilli: number; minMilli?: number; costKurus?: number | null },
  ): Promise<StockDTO> {
    this.require(ctx, "stock.edit");
    const batchKey = `add:${input.key}`;
    if ((await this.store.listBatch(ctx.cafe.id, batchKey)).length > 0) return this.view(ctx);
    const item: StockItem = {
      id: `stk_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      name: input.name.trim(),
      kind: input.kind,
      unit: input.unit,
      qtyMilli: 0,
      minMilli: input.minMilli ?? 0,
      costKurus: input.costKurus ?? null,
      archivedAt: null,
      createdAt: this.now(),
    };
    this.check(stockItemProblem(item));
    this.qty(input.startMilli);
    await this.uniqueName(ctx, item.name, null);
    await this.store.saveItem(item);
    await this.apply(ctx, { batchKey, reason: "start", changes: [{ id: `smv_${randomUUID()}`, itemId: item.id, changeMilli: input.startMilli }] });
    return this.view(ctx);
  }

  /** Changes only what was sent. The unit is fixed once anything used or counted it. */
  async updateItem(
    ctx: StaffContext,
    itemId: string,
    input: { name?: string; kind?: StockKind; unit?: StockUnit; minMilli?: number; costKurus?: number | null; removed?: boolean },
  ): Promise<StockDTO> {
    this.require(ctx, "stock.edit");
    const current = await this.item(ctx, itemId);
    const next: StockItem = { ...current };
    if (input.name !== undefined) next.name = input.name.trim();
    if (input.kind !== undefined) next.kind = input.kind;
    if (input.minMilli !== undefined) next.minMilli = input.minMilli;
    if (input.costKurus !== undefined) next.costKurus = input.costKurus;
    this.check(stockItemProblem(next));
    const recipes = await this.store.listRecipes(ctx.cafe.id);
    const inRecipe = recipes.some((r) => r.lines.some((l) => l.itemId === itemId));
    if (input.unit !== undefined && input.unit !== current.unit) {
      const moved = (await this.store.listMoves(ctx.cafe.id, { itemId, limit: 50 })).some((m) => m.reason !== "start");
      if (moved || inRecipe) throw new AppError("STOCK_UNIT_LOCKED", "Its unit can't change once it's been used; add a new item instead", 409);
      next.unit = input.unit;
    }
    if (input.removed === true && !current.archivedAt) {
      if (inRecipe) throw new AppError("STOCK_ITEM_IN_USE", "A recipe uses it; take it out of the recipe first", 409);
      next.archivedAt = this.now();
    }
    if (input.removed === false) next.archivedAt = null;
    if (!next.archivedAt && (next.name !== current.name || current.archivedAt)) await this.uniqueName(ctx, next.name, itemId);
    await this.store.saveItem(next);
    return this.view(ctx);
  }

  /** "Sayım": what is there now. The difference from what should be there is recorded for each item. */
  async count(ctx: StaffContext, input: { key: string; counts: { itemId: string; countedMilli: number }[]; note?: string }): Promise<StockDTO> {
    this.require(ctx, "stock.edit");
    const ids = input.counts.map((c) => c.itemId);
    if (new Set(ids).size !== ids.length) throw new AppError("VALIDATION", "Each item once per count", 400);
    for (const c of input.counts) {
      this.qty(c.countedMilli);
      await this.item(ctx, c.itemId, true);
    }
    await this.apply(ctx, {
      batchKey: `count:${input.key}`,
      reason: "count",
      note: input.note?.trim() || null,
      changes: input.counts.map((c) => ({ id: `smv_${randomUUID()}`, itemId: c.itemId, countedMilli: c.countedMilli })),
    });
    return this.view(ctx);
  }

  /** "Fire": spilled, expired, broken. Always takes away; "other" needs a word on what happened. */
  async waste(ctx: StaffContext, input: { key: string; itemId: string; qtyMilli: number; why: WasteWhy; note?: string }): Promise<StockDTO> {
    this.require(ctx, "stock.edit");
    this.qty(input.qtyMilli);
    if (input.qtyMilli <= 0) throw new AppError("QTY_INVALID", "Check the amount", 400);
    const note = input.note?.trim() || null;
    if (input.why === "other" && !note) throw new AppError("WASTE_NOTE_REQUIRED", "Say briefly what happened", 400);
    await this.item(ctx, input.itemId, true);
    await this.apply(ctx, {
      batchKey: `waste:${input.key}`,
      reason: "waste",
      why: input.why,
      note,
      changes: [{ id: `smv_${randomUUID()}`, itemId: input.itemId, changeMilli: -input.qtyMilli }],
    });
    return this.view(ctx);
  }

  // ─────────────────────────────────────────────── recipes, in Menü

  /** Every product on the menu with how it uses stock and what one costs (D30). Needs "menu.recipes" (manager and chef). */
  async recipes(ctx: StaffContext): Promise<RecipesDTO> {
    this.require(ctx, "menu.recipes");
    const cafeId = ctx.cafe.id;
    const [products, recipes, items] = await Promise.all([
      this.menu.listMenu(cafeId),
      this.store.listRecipes(cafeId),
      this.store.listItems(cafeId, { includeArchived: true }),
    ]);
    const byProduct = new Map(recipes.map((r) => [r.productId, r]));
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
      recipes: products.map((p) => ({
        ...recipeDTO(byProduct.get(p.productId) ?? { productId: p.productId, mode: "none", lines: [] }, byId),
        name: p.name,
        category: p.category,
        priceKurus: p.priceKurus,
        imageUrl: p.imageUrl ?? null,
      })),
      items: items
        .filter((i) => !i.archivedAt)
        .map((i) => ({ id: i.id, name: i.name, unit: i.unit, kind: i.kind, costKurus: i.costKurus })),
    };
  }

  /**
   * "Stok nasıl düşsün?": by recipe (any items, per one of the product), as a counted piece
   * (one item counted in pieces, a bottled drink), or not at all.
   */
  async saveRecipe(ctx: StaffContext, productId: string, input: { mode: StockMode; lines: { itemId: string; qtyMilli: number }[] }): Promise<RecipesDTO> {
    this.require(ctx, "menu.recipes");
    if (!(await this.menu.getProduct(ctx.cafe.id, productId))) throw new AppError("PRODUCT_NOT_FOUND", "No such product", 404);
    const lines = input.mode === "none" ? [] : input.lines;
    const ids = lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw new AppError("RECIPE_DUPLICATE", "Each item once; raise its amount instead", 400);
    const items: StockItem[] = [];
    for (const l of lines) {
      if (!Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0) throw new AppError("QTY_INVALID", "Check the amount", 400);
      items.push(await this.item(ctx, l.itemId, true));
    }
    if (input.mode === "recipe" && lines.length === 0) throw new AppError("RECIPE_EMPTY", "Add at least one item", 400);
    if (input.mode === "counted" && (lines.length !== 1 || items[0]!.unit !== "adet")) {
      throw new AppError("RECIPE_COUNTED_ONE", "A counted product is one item counted in pieces", 400);
    }
    await this.store.saveRecipe({ cafeId: ctx.cafe.id, productId, mode: input.mode, lines: lines.map((l) => ({ itemId: l.itemId, qtyMilli: l.qtyMilli })) });
    return this.recipes(ctx);
  }

  // ─────────────────────────────────────────────── sales (called by the till)

  /**
   * A paid order uses stock by its products' recipes. Once per order, however often it's
   * retried. Never refuses: stock can go below zero, and Stok shows it.
   */
  async used(order: Pick<Order, "id" | "cafeId" | "lines">, memberId: string | null): Promise<void> {
    const recipes = new Map((await this.store.listRecipes(order.cafeId)).map((r) => [r.productId, r]));
    const { recipe, counted } = stockUse(order.lines, recipes);
    const changes = (use: Map<string, number>) =>
      [...use].filter(([, milli]) => milli > 0).map(([itemId, milli]) => ({ id: `smv_${randomUUID()}`, itemId, changeMilli: -milli }));
    const base = { cafeId: order.cafeId, reason: "sale" as const, orderId: order.id, memberId, at: this.now() };
    // Two batches: a refund puts the counted ones back and leaves what the recipes used.
    await this.store.applyBatch({ ...base, batchKey: `sale:${order.id}`, changes: changes(recipe) });
    await this.store.applyBatch({ ...base, batchKey: `sale-counted:${order.id}`, changes: changes(counted) });
  }

  /** A refunded order puts back what it took as counted pieces. Once per order. */
  async refunded(order: Pick<Order, "id" | "cafeId">, memberId: string | null): Promise<void> {
    const taken = await this.store.listBatch(order.cafeId, `sale-counted:${order.id}`);
    if (taken.length === 0) return;
    await this.store.applyBatch({
      cafeId: order.cafeId,
      batchKey: `refund:${order.id}`,
      reason: "refund",
      orderId: order.id,
      memberId,
      at: this.now(),
      changes: taken.map((m) => ({ id: `smv_${randomUUID()}`, itemId: m.itemId, changeMilli: -m.changeMilli })),
    });
  }

  // ─────────────────────────────────────────────── helpers

  private async apply(ctx: StaffContext, batch: Omit<StockBatch, "cafeId" | "at" | "memberId">): Promise<void> {
    await this.store.applyBatch({ ...batch, cafeId: ctx.cafe.id, memberId: ctx.member.id, at: this.now() });
  }

  private async item(ctx: StaffContext, itemId: string, live = false): Promise<StockItem> {
    const item = await this.store.getItem(ctx.cafe.id, itemId);
    if (!item || (live && item.archivedAt)) throw new AppError("STOCK_ITEM_NOT_FOUND", "No such stock item", 404);
    return item;
  }

  private async uniqueName(ctx: StaffContext, name: string, self: string | null): Promise<void> {
    const live = await this.store.listItems(ctx.cafe.id);
    if (live.some((i) => i.id !== self && sameMenuName(i.name, name))) throw new AppError("STOCK_ITEM_EXISTS", "There is already an item with this name", 409);
  }

  private qty(milli: number): void {
    if (!Number.isInteger(milli) || milli < 0 || milli > 1_000_000_000) throw new AppError("QTY_INVALID", "Check the amount", 400);
  }

  private async moveDTOs(moves: StockMove[], items: Map<string, StockItem>): Promise<StockMoveDTO[]> {
    const names = await this.names(moves.map((m) => m.memberId));
    const missing = moves.filter((m) => !items.has(m.itemId));
    for (const m of missing) {
      const item = await this.store.getItem(m.cafeId, m.itemId);
      if (item) items.set(item.id, item);
    }
    return moves.map((m) => {
      const item = items.get(m.itemId);
      const cost = item?.costKurus ?? null;
      return {
        id: m.id,
        itemId: m.itemId,
        itemName: item?.name ?? "",
        unit: item?.unit ?? "adet",
        changeMilli: m.changeMilli,
        afterMilli: m.afterMilli,
        reason: m.reason,
        why: m.why,
        note: m.note,
        by: m.memberId ? (names.get(m.memberId) ?? null) : null,
        at: m.at.toISOString(),
        valueKurus: cost === null ? null : Math.round((Math.abs(m.changeMilli) * cost) / MILLI),
      };
    });
  }

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private check(problem: StockProblem | null): void {
    if (!problem) return;
    const code = problem === "NAME_EMPTY" ? "NAME_REQUIRED" : problem === "AMOUNT_INVALID" ? "QTY_INVALID" : problem;
    throw new AppError(code, "Check the item's details", 400);
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}

/** Item id to the names of products on the menu that use it. */
function usedByNames(recipes: Recipe[], products: { productId: string; name: string }[]): Map<string, string[]> {
  const names = new Map(products.map((p) => [p.productId, p.name]));
  const out = new Map<string, string[]>();
  for (const r of recipes) {
    const name = names.get(r.productId);
    if (!name || r.mode === "none") continue;
    for (const l of r.lines) out.set(l.itemId, [...(out.get(l.itemId) ?? []), name]);
  }
  for (const list of out.values()) list.sort((a, b) => a.localeCompare(b, "tr"));
  return out;
}

function itemDTO(i: StockItem, usedBy: string[], countedAt: Date | null, unitLocked: boolean): StockItemDTO {
  return {
    id: i.id,
    name: i.name,
    kind: i.kind,
    unit: i.unit,
    qtyMilli: i.qtyMilli,
    minMilli: i.minMilli,
    costKurus: i.costKurus,
    level: stockLevel(i),
    usedBy,
    countedAt: countedAt?.toISOString() ?? null,
    unitLocked,
  };
}

function recipeDTO(r: Pick<Recipe, "productId" | "mode" | "lines">, items: Map<string, StockItem>): Omit<RecipeDTO, "name" | "category" | "priceKurus" | "imageUrl"> {
  return {
    productId: r.productId,
    mode: r.mode,
    lines: r.lines.map((l) => ({ itemId: l.itemId, qtyMilli: l.qtyMilli })),
    costKurus: recipeCost(r, items),
    unpriced: r.mode === "none" ? [] : r.lines.map((l) => items.get(l.itemId)).filter((i) => i && i.costKurus === null).map((i) => i!.name),
  };
}

const LEVEL_RANK = { out: 0, low: 1, ok: 2 } as const;
function worstFirst(a: { level: keyof typeof LEVEL_RANK; name: string }, b: { level: keyof typeof LEVEL_RANK; name: string }): number {
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.name.localeCompare(b.name, "tr");
}
