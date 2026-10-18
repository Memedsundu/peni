import type { MenuCategory, MenuItem, MenuStore } from "@peni/core";
import type { Db } from "./db";

const PRODUCT = {
  productId: true,
  name: true,
  categoryId: true,
  priceKurus: true,
  available: true,
  description: true,
  imageUrl: true,
  sortOrder: true,
  archivedAt: true,
  category: { select: { name: true } },
} as const;

type ProductRow = {
  productId: string;
  name: string;
  categoryId: string | null;
  priceKurus: number;
  available: boolean;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  archivedAt: Date | null;
  category: { name: string } | null;
};

function toItem(r: ProductRow): MenuItem {
  return { ...r, category: r.category?.name ?? "" };
}

export class PrismaMenuStore implements MenuStore {
  constructor(private readonly db: Db) {}

  async listCategories(cafeId: string): Promise<MenuCategory[]> {
    return this.db().menuCategory.findMany({
      where: { cafeId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, cafeId: true, name: true, sortOrder: true },
    });
  }

  async saveCategory(c: MenuCategory): Promise<void> {
    await this.db().menuCategory.upsert({
      where: { id: c.id },
      create: { id: c.id, cafeId: c.cafeId, name: c.name, sortOrder: c.sortOrder },
      update: { name: c.name, sortOrder: c.sortOrder },
    });
  }

  async deleteCategory(cafeId: string, categoryId: string): Promise<void> {
    // Products that were removed from the menu keep their row; the foreign key sets their category to null.
    await this.db().menuCategory.deleteMany({ where: { id: categoryId, cafeId } });
  }

  async listMenu(cafeId: string, opts: { includeArchived?: boolean } = {}): Promise<MenuItem[]> {
    const rows = await this.db().menuItem.findMany({
      where: { cafeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: PRODUCT,
    });
    // Products without a category (removed ones only) go last, as in the in-memory store.
    return [...rows.filter((r) => r.categoryId), ...rows.filter((r) => !r.categoryId)].map(toItem);
  }

  async getProduct(cafeId: string, productId: string): Promise<MenuItem | null> {
    const r = await this.db().menuItem.findUnique({ where: { cafeId_productId: { cafeId, productId } }, select: PRODUCT });
    return r ? toItem(r) : null;
  }

  async saveProduct(cafeId: string, item: MenuItem): Promise<void> {
    const data = {
      name: item.name,
      categoryId: item.categoryId,
      priceKurus: item.priceKurus,
      available: item.available,
      description: item.description ?? null,
      imageUrl: item.imageUrl ?? null,
      sortOrder: item.sortOrder ?? 0,
      archivedAt: item.archivedAt ?? null,
    };
    await this.db().menuItem.upsert({
      where: { cafeId_productId: { cafeId, productId: item.productId } },
      create: { cafeId, productId: item.productId, ...data },
      update: data,
    });
  }
}
