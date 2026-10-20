import type { DraftStatus } from "./assistant";
import type { StockKind, StockMode, StockUnit } from "./stock";

/**
 * Recipes the assistant drafts (D21): for a product with no recipe yet, a first go at what
 * one uses, from the café's stock items and, where it has none that fit, items to add. It
 * stays a draft until someone who edits recipes confirms it (as it is or changed) or lets
 * it go; only then is a recipe saved, in their name. A product that already has a recipe,
 * even "Düşmesin", is never drafted for and never overwritten.
 */

/** A stock item the draft needs that the café doesn't have; created when the draft is confirmed. */
export interface NewStockItem {
  name: string;
  unit: StockUnit;
  kind: StockKind;
}

export interface RecipeProposalLine {
  /** One of the café's items, or null for one of `newItems`. */
  itemId: string | null;
  /** Which of `newItems` (0-based), when `itemId` is null. */
  newItem: number | null;
  /** Per one of the product, in thousandths of the item's unit. */
  qtyMilli: number;
}

/** A recipe as the assistant wrote it. */
export interface RecipeProposal {
  mode: StockMode;
  lines: RecipeProposalLine[];
  newItems: NewStockItem[];
  /** With "none": why it uses nothing. */
  reason: string | null;
}

export interface RecipeDraft {
  id: string;
  cafeId: string;
  productId: string;
  /** The product's name when it was drafted, for the log. */
  productName: string;
  status: DraftStatus;
  /** As the assistant wrote it, never changed afterwards. */
  proposal: RecipeProposal;
  /** What the assistant assumed, in words for the owner: "Süt miktarı standart 220 ml varsayıldı." */
  notes: string[];
  /** Which model wrote it. */
  model: string;
  /** Who asked for it. */
  createdById: string;
  createdAt: Date;
  decidedById: string | null;
  decidedAt: Date | null;
  /** What the person changed before confirming, for the log: "mode", "lines", "newItems". */
  changed: string[];
  dismissReason: string | null;
}

/** Recipe drafts a café may have written in a day; a long menu fits, a loop doesn't. */
export const RECIPE_DRAFTS_PER_DAY = 300;

export interface RecipeDraftStore {
  /** Creates it or replaces it by id. */
  saveRecipeDraft(draft: RecipeDraft): Promise<void>;
  getRecipeDraft(cafeId: string, id: string): Promise<RecipeDraft | null>;
  /** Open drafts, newest first. */
  listOpenRecipeDrafts(cafeId: string): Promise<RecipeDraft[]>;
  /** Drafts written since `since`, for the day's limit. */
  countRecipeDraftsSince(cafeId: string, since: Date): Promise<number>;
}

export class InMemoryRecipeDraftStore implements RecipeDraftStore {
  private readonly drafts = new Map<string, RecipeDraft>();

  async saveRecipeDraft(draft: RecipeDraft) {
    this.drafts.set(draft.id, structuredClone(draft));
  }
  async getRecipeDraft(cafeId: string, id: string) {
    const d = this.drafts.get(id);
    return d && d.cafeId === cafeId ? structuredClone(d) : null;
  }
  async listOpenRecipeDrafts(cafeId: string) {
    return [...this.drafts.values()]
      .filter((d) => d.cafeId === cafeId && d.status === "open")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .map((d) => structuredClone(d));
  }
  async countRecipeDraftsSince(cafeId: string, since: Date) {
    return [...this.drafts.values()].filter((d) => d.cafeId === cafeId && d.createdAt >= since).length;
  }
}
