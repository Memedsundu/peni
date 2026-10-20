import type { Bill } from "./bills";
import type { MenuItem } from "./menu";
import type { Recipe, StockItem } from "./stock";

/**
 * Kurulum listesi: what keeps a café's stock from being complete, for Bugün. Every product
 * should say what it uses, every delivery should reach stock, every item should come in on a
 * bill from a known supplier, and be counted now and then. Each part clears itself once it's done; the list is gone
 * when all of it is.
 */

/** How far back bill lines are looked at and counts are expected: 30 days. */
export const SETUP_DAYS = 30;

export interface SetupChecklist {
  /** Products on the menu with no recipe yet, of how many there are; null when not asked. */
  noRecipe: { count: number; total: number; names: string[] } | null;
  /** Live bills of the last 30 days with no supplier: they count towards nobody's debts, prices or checks. */
  noSupplier: { count: number; bills: { id: string; date: string; totalKurus: number; lines: string[] }[] } | null;
  /** Live bills of the last 30 days with a line that looked like stock but reached none. */
  unstocked: { count: number; bills: { id: string; supplierId: string | null; date: string; lines: string[] }[] } | null;
  /** Stock items no live bill has ever brought. */
  neverBought: { count: number; names: string[] } | null;
  /** Items a recipe uses that nobody counted in the last 30 days. */
  notCounted: { count: number; names: string[] } | null;
}

/**
 * The checklist from the café's own records. A part is null when the viewer can't see it
 * (its input is null) or there is nothing to do about it.
 *
 * - A product has a recipe once its recipe says something: what it uses, that it's one
 *   counted piece, or that it shouldn't use stock ("Düşmesin"). Hidden products don't count.
 * - A bill with no supplier is any live one of the last 30 days, whatever it was for.
 * - A line "looked like stock" when it was for ingredients or supplies and has no item;
 *   lines the café said aren't stock (`notStock`) are left out.
 * - An item's last count is its latest count or starting amount; one with neither has had
 *   30 days from when it was added.
 */
export function setupChecklist(input: {
  products: Pick<MenuItem, "productId" | "name" | "available" | "archivedAt">[] | null;
  recipes: Pick<Recipe, "productId" | "mode" | "lines">[];
  /** Live items, or null for a viewer who doesn't manage stock. */
  items: Pick<StockItem, "id" | "name" | "createdAt">[] | null;
  /** Bills dated in the last 30 days, or null for a viewer who can't see bills. */
  bills: Pick<Bill, "id" | "supplierId" | "date" | "lines" | "voidedAt">[] | null;
  /** The same bills, for a viewer who can correct them (and so give them a supplier); null otherwise. */
  supplierBills?: Pick<Bill, "id" | "supplierId" | "date" | "lines" | "totalKurus" | "voidedAt">[] | null;
  /** Items some live bill has a line for. */
  bought: ReadonlySet<string>;
  /** When each item was last counted (a count or its starting amount). */
  lastCounted: ReadonlyMap<string, Date>;
  /** A line the café said isn't stock: "Kasa depozitosu" from this supplier. */
  notStock?: (supplierId: string | null, lineName: string) => boolean;
  now: Date;
}): SetupChecklist {
  const recipes = new Map(input.recipes.map((r) => [r.productId, r]));
  const since = new Date(input.now.getTime() - SETUP_DAYS * 86_400_000);

  let noRecipe: SetupChecklist["noRecipe"] = null;
  if (input.products) {
    const onMenu = input.products.filter((p) => p.available && !p.archivedAt);
    const missing = onMenu.filter((p) => {
      const r = recipes.get(p.productId);
      return !r || (r.mode !== "none" && r.lines.length === 0);
    });
    if (missing.length) noRecipe = { count: missing.length, total: onMenu.length, names: missing.map((p) => p.name) };
  }

  let unstocked: SetupChecklist["unstocked"] = null;
  if (input.bills) {
    const bills = input.bills
      .filter((b) => !b.voidedAt)
      .map((b) => ({
        id: b.id,
        supplierId: b.supplierId,
        date: b.date,
        lines: b.lines
          .filter((l) => !l.itemId && (l.category === "ingredients" || l.category === "supplies") && !input.notStock?.(b.supplierId, l.name))
          .map((l) => l.name),
      }))
      .filter((b) => b.lines.length)
      .sort((a, b) => b.date.localeCompare(a.date));
    const count = bills.reduce((s, b) => s + b.lines.length, 0);
    if (count) unstocked = { count, bills };
  }

  let noSupplier: SetupChecklist["noSupplier"] = null;
  if (input.supplierBills) {
    const bills = input.supplierBills
      .filter((b) => !b.voidedAt && !b.supplierId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((b) => ({ id: b.id, date: b.date, totalKurus: b.totalKurus, lines: b.lines.map((l) => l.name) }));
    if (bills.length) noSupplier = { count: bills.length, bills };
  }

  let neverBought: SetupChecklist["neverBought"] = null;
  let notCounted: SetupChecklist["notCounted"] = null;
  if (input.items) {
    const never = input.items.filter((i) => !input.bought.has(i.id));
    if (never.length) neverBought = { count: never.length, names: never.map((i) => i.name) };
    const used = new Set(input.recipes.filter((r) => r.mode !== "none").flatMap((r) => r.lines.map((l) => l.itemId)));
    const stale = input.items.filter((i) => used.has(i.id) && (input.lastCounted.get(i.id) ?? i.createdAt) < since);
    if (stale.length) notCounted = { count: stale.length, names: stale.map((i) => i.name) };
  }

  return { noRecipe, noSupplier, unstocked, neverBought, notCounted };
}

/** Whether the checklist has anything left on it. */
export function setupOpen(c: SetupChecklist): boolean {
  return !!(c.noRecipe || c.noSupplier || c.unstocked || c.neverBought || c.notCounted);
}
