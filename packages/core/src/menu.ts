import type { Kurus } from "./money";

/**
 * Menü (plan piece 5): what a café sells. Categories hold products; the till, the
 * customer pages and the askı all read prices from here, never from a client.
 */

/** A group on the menu and a tab on the till: "Sıcak", "Soğuk", "Tatlı". */
export interface MenuCategory {
  id: string;
  cafeId: string;
  name: string;
  /** Lower first. */
  sortOrder: number;
}

/** One product a café sells. */
export interface MenuItem {
  /** Stable within the café; sales, the askı and reports refer to it. */
  productId: string;
  name: string;
  /** Null only for a removed product whose category was deleted later. */
  categoryId: string | null;
  /** The category's name, filled in by the store. */
  category: string;
  priceKurus: Kurus;
  /** On the till and the customer pages. Off hides it without removing it. */
  available: boolean;
  description?: string | null;
  imageUrl?: string | null;
  /** Lower first, within its category. */
  sortOrder?: number;
  /** "Menüden kaldır": gone from the menu, kept for past sales and reports; can be brought back. */
  archivedAt?: Date | null;
}

export interface MenuStore {
  /** In the café's order. */
  listCategories(cafeId: string): Promise<MenuCategory[]>;
  /** Creates the category or updates it. */
  saveCategory(category: MenuCategory): Promise<void>;
  /** Removed products in it keep their data with no category. */
  deleteCategory(cafeId: string, categoryId: string): Promise<void>;
  /** By category order, then product order. Removed products only when asked. */
  listMenu(cafeId: string, opts?: { includeArchived?: boolean }): Promise<MenuItem[]>;
  getProduct(cafeId: string, productId: string): Promise<MenuItem | null>;
  /** Creates the product or updates it. `category` is ignored; `categoryId` decides. */
  saveProduct(cafeId: string, item: MenuItem): Promise<void>;
}

/** Highest price a product can have: 100.000 TL. */
export const MAX_PRICE_KURUS = 10_000_000;
export const MENU_NAME_MAX = 60;
export const MENU_DESCRIPTION_MAX = 280;

export type MenuProblem =
  | "NAME_EMPTY"
  | "NAME_TOO_LONG"
  | "PRICE_INVALID"
  | "DESCRIPTION_TOO_LONG"
  | "IMAGE_URL_INVALID";

/** What's wrong with a product as entered, or null. Pure; the service turns it into an error. */
export function productProblem(p: { name: string; priceKurus: number; description?: string | null; imageUrl?: string | null }): MenuProblem | null {
  if (!p.name.trim()) return "NAME_EMPTY";
  if (p.name.trim().length > MENU_NAME_MAX) return "NAME_TOO_LONG";
  if (!Number.isInteger(p.priceKurus) || p.priceKurus < 0 || p.priceKurus > MAX_PRICE_KURUS) return "PRICE_INVALID";
  if ((p.description?.trim().length ?? 0) > MENU_DESCRIPTION_MAX) return "DESCRIPTION_TOO_LONG";
  if (p.imageUrl && !/^https:\/\/\S+$/.test(p.imageUrl)) return "IMAGE_URL_INVALID";
  return null;
}

/** What's wrong with a category name, or null. */
export function categoryProblem(name: string): MenuProblem | null {
  if (!name.trim()) return "NAME_EMPTY";
  if (name.trim().length > MENU_NAME_MAX) return "NAME_TOO_LONG";
  return null;
}

/** Category names are compared the way a Turkish reader would: "sıcak" and "SICAK" are the same. */
export function sameMenuName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("tr") === b.trim().toLocaleLowerCase("tr");
}

export class InMemoryMenuStore implements MenuStore {
  private readonly categories = new Map<string, MenuCategory>();
  private readonly products = new Map<string, MenuItem>(); // `${cafeId}:${productId}`

  async listCategories(cafeId: string) {
    return [...this.categories.values()]
      .filter((c) => c.cafeId === cafeId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "tr"))
      .map((c) => ({ ...c }));
  }

  async saveCategory(category: MenuCategory) {
    this.categories.set(category.id, { ...category });
  }

  async deleteCategory(cafeId: string, categoryId: string) {
    if (this.categories.get(categoryId)?.cafeId !== cafeId) return;
    this.categories.delete(categoryId);
    for (const [key, p] of this.products) {
      if (key.startsWith(`${cafeId}:`) && p.categoryId === categoryId) this.products.set(key, { ...p, categoryId: null });
    }
  }

  async listMenu(cafeId: string, opts: { includeArchived?: boolean } = {}) {
    const categories = await this.listCategories(cafeId);
    const rank = new Map(categories.map((c, i) => [c.id, i]));
    return [...this.products.entries()]
      .filter(([key, p]) => key.startsWith(`${cafeId}:`) && (opts.includeArchived || !p.archivedAt))
      .map(([, p]) => this.withCategory(p, categories))
      .sort(
        (a, b) =>
          (rank.get(a.categoryId ?? "") ?? Infinity) - (rank.get(b.categoryId ?? "") ?? Infinity) ||
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name, "tr"),
      );
  }

  async getProduct(cafeId: string, productId: string) {
    const p = this.products.get(`${cafeId}:${productId}`);
    return p ? this.withCategory(p, await this.listCategories(cafeId)) : null;
  }

  async saveProduct(cafeId: string, item: MenuItem) {
    this.products.set(`${cafeId}:${item.productId}`, { ...item, category: "", archivedAt: item.archivedAt ?? null });
  }

  private withCategory(p: MenuItem, categories: MenuCategory[]): MenuItem {
    return { ...p, category: categories.find((c) => c.id === p.categoryId)?.name ?? "" };
  }
}
