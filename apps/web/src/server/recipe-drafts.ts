import { isAiError, readRecipe, recipeDraftingRequest, type AiModel } from "@peni/ai";
import type { RecipeDraftDTO, RecipeDraftsDTO, RecipesDTO } from "@peni/api";
import {
  RECIPE_DRAFTS_PER_DAY,
  recipeCost,
  sameMenuName,
  STOCK_UNITS,
  startOfLocalDay,
  stockItemProblem,
  type AiEvent,
  type AssistantStore,
  type MenuStore,
  type NewStockItem,
  type PeniDirectory,
  type Permission,
  type RecipeDraft,
  type RecipeDraftStore,
  type RecipeProposal,
  type StockItem,
  type StockMode,
  type StockStore,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import type { AiMode } from "./assistant";
import { eventId } from "./assistant";
import { AppError } from "./errors";
import { requirePermission, type StaffContext } from "./staff";
import type { StockService } from "./stock";

const PURPOSE = "recipe.draft";
/** The most stock items the model is shown, like a bill's reading. */
const STOCK_SHOWN = 300;

/** A recipe as the person confirms it: lines name one of the café's items or one of the new ones. */
export interface ConfirmRecipeInput {
  mode: StockMode;
  lines: { itemId: string | null; newItem: number | null; qtyMilli: number }[];
  newItems: NewStockItem[];
}

/**
 * Recipes the assistant drafts, in Menü (D21). For a product with no recipe yet, the model
 * writes a first go from the café's stock items; the draft waits until someone who edits
 * recipes confirms it (as it is or changed, adding any new items it needs to Stok) or lets
 * it go. A product that has a recipe, "Düşmesin" included, is never drafted for and never
 * overwritten. Every call to the model and every decision goes into the assistant's log.
 */
export class RecipeDraftService {
  constructor(
    private readonly drafts: RecipeDraftStore,
    private readonly stockStore: StockStore,
    private readonly stock: StockService,
    private readonly menu: MenuStore,
    private readonly log: AssistantStore,
    private readonly directory: PeniDirectory,
    private readonly ai: { model: AiModel | null; mode: AiMode },
    private readonly now: () => Date,
  ) {}

  /** Open drafts for products still without a recipe, and the products with neither. */
  async list(ctx: StaffContext): Promise<RecipeDraftsDTO> {
    this.require(ctx, "menu.recipes");
    const cafeId = ctx.cafe.id;
    const [products, recipes, items, open, written] = await Promise.all([
      this.menu.listMenu(cafeId),
      this.stockStore.listRecipes(cafeId),
      this.stockStore.listItems(cafeId, { includeArchived: true }),
      this.drafts.listOpenRecipeDrafts(cafeId),
      this.writtenToday(cafeId),
    ]);
    const has = new Set(recipes.map((r) => r.productId));
    const onMenu = new Set(products.map((p) => p.productId));
    const byId = new Map(items.map((i) => [i.id, i]));
    // The newest draft per product; one written twice at once shows once.
    const shown = new Map<string, RecipeDraft>();
    for (const d of open) if (onMenu.has(d.productId) && !has.has(d.productId) && !shown.has(d.productId)) shown.set(d.productId, d);
    return {
      drafts: [...shown.values()].map((d) => draftDTO(d, byId)),
      missing: products.filter((p) => !has.has(p.productId) && !shown.has(p.productId)).map((p) => p.productId),
      ai: this.ai.mode,
      left: Math.max(0, RECIPE_DRAFTS_PER_DAY - written),
      canAddItems: ctx.permissions.has("stock.edit"),
    };
  }

  /**
   * "Reçeteyi asistan yazsın": asks the model for one product's recipe and keeps it as a
   * draft. A product with an open draft keeps it; one with a recipe gets nothing.
   */
  async draft(ctx: StaffContext, productId: string): Promise<RecipeDraftsDTO> {
    this.require(ctx, "menu.recipes");
    const model = this.ai.model;
    if (!model) throw new AppError("RECIPE_AI_OFF", "The assistant is off", 409);
    const cafeId = ctx.cafe.id;
    const product = await this.menu.getProduct(cafeId, productId);
    if (!product || product.archivedAt) throw new AppError("PRODUCT_NOT_FOUND", "No such product", 404);
    if (await this.stockStore.getRecipe(cafeId, productId)) throw new AppError("RECIPE_EXISTS", "This product already has a recipe", 409);
    if ((await this.drafts.listOpenRecipeDrafts(cafeId)).some((d) => d.productId === productId)) return this.list(ctx);
    if ((await this.writtenToday(cafeId)) >= RECIPE_DRAFTS_PER_DAY) throw new AppError("RECIPE_DRAFT_LIMIT", "That's all the recipe drafts for today", 429);

    const items = (await this.stockStore.listItems(cafeId)).slice(0, STOCK_SHOWN);
    const request = recipeDraftingRequest(
      { name: product.name, category: product.category, priceKurus: product.priceKurus, description: product.description ?? null },
      items.map((i) => ({ name: i.name, unit: i.unit })),
    );
    const base = { cafeId, kind: "ai.call" as const, memberId: ctx.member.id, purpose: PURPOSE };
    const started = Date.now();
    let result;
    try {
      result = await model.run(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.record({ ...base, model: model.name, ...(isAiError(error) ? error.usage : {}), ms: Date.now() - started, ok: false, detail: message.slice(0, 300) });
      throw new AppError("RECIPE_DRAFT_FAILED", "The assistant couldn't write this recipe", 502);
    }
    await this.record({ ...base, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ms: result.ms, detail: product.name });

    const read = readRecipe(result.output, items);
    // A "new" item the café already has under the same name and unit is that item.
    const newItems: NewStockItem[] = [];
    const newAt = new Map<number, number>();
    const asItem = new Map<number, string>();
    for (const [n, item] of read.newItems.entries()) {
      const same = items.find((i) => sameMenuName(i.name, item.name) && i.unit === item.unit);
      if (same) asItem.set(n, same.id);
      else newAt.set(n, newItems.push(item) - 1);
    }
    const proposal: RecipeProposal = {
      mode: read.mode,
      lines: read.lines.map((l) =>
        l.stockIndex !== null
          ? { itemId: items[l.stockIndex]!.id, newItem: null, qtyMilli: l.qtyMilli }
          : asItem.has(l.newIndex!)
            ? { itemId: asItem.get(l.newIndex!)!, newItem: null, qtyMilli: l.qtyMilli }
            : { itemId: null, newItem: newAt.get(l.newIndex!)!, qtyMilli: l.qtyMilli },
      ),
      newItems,
      reason: read.reason,
    };
    const draft: RecipeDraft = {
      id: `rcd_${randomUUID()}`,
      cafeId,
      productId,
      productName: product.name,
      status: "open",
      proposal,
      notes: read.notes,
      model: result.model,
      createdById: ctx.member.id,
      createdAt: this.now(),
      decidedById: null,
      decidedAt: null,
      changed: [],
      dismissReason: null,
    };
    await this.drafts.saveRecipeDraft(draft);
    await this.record({ cafeId, kind: "draft.created", memberId: ctx.member.id, draftId: draft.id, detail: `Reçete · ${product.name}` });
    return this.list(ctx);
  }

  /**
   * "Reçeteyi onayla": the recipe as the person left it is saved in their name, after adding
   * to Stok the new items it uses (at 0, to be counted or come with a bill). Never over a
   * recipe the product got meanwhile. Confirming twice saves it once.
   */
  async confirm(ctx: StaffContext, draftId: string, input: ConfirmRecipeInput): Promise<RecipesDTO> {
    this.require(ctx, "menu.recipes");
    const cafeId = ctx.cafe.id;
    const draft = await this.get(ctx, draftId);
    if (draft.status === "confirmed") return this.stock.recipes(ctx);
    if (draft.status === "dismissed") throw new AppError("DRAFT_DECIDED", "This draft was dismissed", 409);
    if (await this.stockStore.getRecipe(cafeId, draft.productId)) throw new AppError("RECIPE_EXISTS", "This product already has a recipe", 409);

    const lines = input.mode === "none" ? [] : input.lines;
    for (const l of lines) {
      if ((l.itemId === null) === (l.newItem === null) || (l.newItem !== null && !input.newItems[l.newItem])) {
        throw new AppError("VALIDATION", "Each line is one item", 400);
      }
    }
    // Only the new items a line uses are added; one already on Stok by that name is used as it is.
    const live = await this.stockStore.listItems(cafeId);
    const used = [...new Set(lines.map((l) => l.newItem).filter((n): n is number => n !== null))];
    const toAdd = used.filter((n) => !live.some((i) => sameMenuName(i.name, input.newItems[n]!.name)));
    for (const n of used) {
      const same = live.find((i) => sameMenuName(i.name, input.newItems[n]!.name));
      if (same && same.unit !== input.newItems[n]!.unit) throw new AppError("STOCK_ITEM_EXISTS", "There is already an item with this name", 409);
    }
    if (toAdd.length) this.require(ctx, "stock.edit");
    const keys = lines.map((l) => l.itemId ?? `new:${l.newItem}`);
    if (new Set(keys).size !== keys.length) throw new AppError("RECIPE_DUPLICATE", "Each item once; raise its amount instead", 400);
    // Checked before anything is added, with each new item's unit.
    const unitOf = (l: (typeof lines)[number]) => (l.itemId !== null ? live.find((i) => i.id === l.itemId)?.unit : input.newItems[l.newItem!]!.unit);
    if (lines.some((l) => !unitOf(l))) throw new AppError("STOCK_ITEM_NOT_FOUND", "No such stock item", 404);
    if (input.mode === "recipe" && lines.length === 0) throw new AppError("RECIPE_EMPTY", "Add at least one item", 400);
    if (input.mode === "counted" && (lines.length !== 1 || unitOf(lines[0]!) !== "adet")) {
      throw new AppError("RECIPE_COUNTED_ONE", "A counted product is one item counted in pieces", 400);
    }

    // Everything saveRecipe would refuse, and every new item's name and unit, is checked
    // before an item is added: a recipe that can't be saved leaves nothing in Stok.
    if (lines.some((l) => !Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0)) throw new AppError("QTY_INVALID", "Check the amount", 400);
    const product = await this.menu.getProduct(cafeId, draft.productId);
    if (!product || product.archivedAt) throw new AppError("PRODUCT_NOT_FOUND", "No such product", 404);
    for (const n of toAdd) {
      const item = input.newItems[n]!;
      const problem = stockItemProblem({ name: item.name.trim(), minMilli: 0, costKurus: null });
      if (!STOCK_UNITS.includes(item.unit) || (item.kind !== "ingredient" && item.kind !== "supply")) throw new AppError("VALIDATION", "Check the new stock item", 400);
      if (problem) throw new AppError(problem === "NAME_TOO_LONG" ? "NAME_TOO_LONG" : "NAME_REQUIRED", "Check the new stock item's name", 400);
    }

    const ids = new Map<number, string>();
    for (const n of used) {
      const same = live.find((i) => sameMenuName(i.name, input.newItems[n]!.name));
      ids.set(n, same ? same.id : await this.addItem(ctx, draft, n, input.newItems[n]!));
    }
    const saved = await this.stock.saveRecipe(ctx, draft.productId, {
      mode: input.mode,
      lines: lines.map((l) => ({ itemId: l.itemId ?? ids.get(l.newItem!)!, qtyMilli: l.qtyMilli })),
    });
    const changed = changedFields(draft.proposal, { ...input, lines });
    Object.assign(draft, { status: "confirmed", decidedById: ctx.member.id, decidedAt: this.now(), changed });
    await this.drafts.saveRecipeDraft(draft);
    await this.record({
      cafeId,
      kind: "draft.confirmed",
      memberId: ctx.member.id,
      draftId: draft.id,
      detail: [`Reçete · ${draft.productName}`, changed.length ? `değişti: ${changed.map((c) => CHANGED_TR[c] ?? c).join(", ")}` : null]
        .filter(Boolean)
        .join(" · "),
    });
    return saved;
  }

  /** "Taslağı bırak": the product stays as it was. Saying it twice changes nothing. */
  async dismiss(ctx: StaffContext, draftId: string, input: { reason?: string | null }): Promise<RecipeDraftsDTO> {
    this.require(ctx, "menu.recipes");
    const draft = await this.get(ctx, draftId);
    if (draft.status === "confirmed") throw new AppError("DRAFT_DECIDED", "This draft was already confirmed", 409);
    if (draft.status === "open") {
      Object.assign(draft, { status: "dismissed", decidedById: ctx.member.id, decidedAt: this.now(), dismissReason: input.reason?.trim() || null });
      await this.drafts.saveRecipeDraft(draft);
      await this.record({
        cafeId: draft.cafeId,
        kind: "draft.dismissed",
        memberId: ctx.member.id,
        draftId: draft.id,
        detail: [`Reçete · ${draft.productName}`, draft.dismissReason].filter(Boolean).join(" · "),
      });
    }
    return this.list(ctx);
  }

  // ─────────────────────────────────────────────── helpers

  /** A new item from a draft, at 0 like "Malzeme ekle" with nothing there yet. */
  private async addItem(ctx: StaffContext, draft: RecipeDraft, n: number, item: NewStockItem): Promise<string> {
    const id = `stk_${randomUUID()}`;
    const name = item.name.trim();
    const stockItem: StockItem = {
      id,
      cafeId: ctx.cafe.id,
      name,
      kind: item.kind,
      unit: item.unit,
      qtyMilli: 0,
      minMilli: 0,
      costKurus: null,
      archivedAt: null,
      createdAt: this.now(),
    };
    await this.stockStore.saveItem(stockItem);
    await this.stockStore.applyBatch({
      cafeId: ctx.cafe.id,
      batchKey: `add:${draft.id}:${n}`,
      reason: "start",
      note: `Reçete taslağından · ${draft.productName}`,
      memberId: ctx.member.id,
      at: this.now(),
      changes: [{ id: `smv_${randomUUID()}`, itemId: id, changeMilli: 0 }],
    });
    return id;
  }

  private async get(ctx: StaffContext, draftId: string): Promise<RecipeDraft> {
    const draft = await this.drafts.getRecipeDraft(ctx.cafe.id, draftId);
    if (!draft) throw new AppError("DRAFT_NOT_FOUND", "No such draft", 404);
    return draft;
  }

  private async writtenToday(cafeId: string): Promise<number> {
    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    return this.drafts.countRecipeDraftsSince(cafeId, startOfLocalDay(this.now(), tz));
  }

  private async record(event: Partial<AiEvent> & Pick<AiEvent, "cafeId" | "kind">): Promise<void> {
    await this.log.addEvent({
      id: eventId(),
      at: this.now(),
      memberId: null,
      purpose: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: null,
      ok: true,
      detail: null,
      draftId: null,
      documentId: null,
      jobId: null,
      ...event,
    });
  }

  private require(ctx: StaffContext, permission: Permission): void {
    requirePermission(ctx, permission);
  }
}

const CHANGED_TR: Record<string, string> = { mode: "stok şekli", lines: "malzemeler", newItems: "yeni malzemeler" };

/** Which parts the person changed before confirming. */
function changedFields(p: RecipeProposal, input: ConfirmRecipeInput): string[] {
  const out: string[] = [];
  if (p.mode !== input.mode) out.push("mode");
  const lines = (ls: ConfirmRecipeInput["lines"]) => JSON.stringify(ls.map((l) => [l.itemId, l.newItem, l.qtyMilli]));
  if (lines(p.lines) !== lines(input.lines)) out.push("lines");
  const items = (xs: NewStockItem[]) => JSON.stringify(xs.map((x) => [x.name.trim(), x.unit, x.kind]));
  if (items(p.newItems) !== items(input.newItems)) out.push("newItems");
  return out;
}

function draftDTO(d: RecipeDraft, items: Map<string, StockItem>): RecipeDraftDTO {
  const p = d.proposal;
  const known = p.lines.filter((l) => l.itemId !== null) as { itemId: string; qtyMilli: number }[];
  const fresh = p.lines.filter((l) => l.newItem !== null).map((l) => p.newItems[l.newItem!]!.name);
  const unpriced = [...known.map((l) => items.get(l.itemId)).filter((i) => i && i.costKurus === null).map((i) => i!.name), ...fresh];
  return {
    id: d.id,
    productId: d.productId,
    productName: d.productName,
    mode: p.mode,
    lines: p.lines.map((l) => ({ ...l })),
    newItems: p.newItems.map((x) => ({ ...x })),
    reason: p.reason,
    notes: [...d.notes],
    costKurus: fresh.length ? null : recipeCost({ mode: p.mode, lines: known }, items),
    unpriced: p.mode === "none" ? [] : unpriced,
    createdAt: d.createdAt.toISOString(),
  };
}
