import type { MenuItem, MenuStore } from "@peni/core";
import type { Db } from "./db";

export class PrismaMenuStore implements MenuStore {
  constructor(private readonly db: Db) {}

  async listMenu(cafeId: string): Promise<MenuItem[]> {
    const rows = await this.db().menuItem.findMany({ where: { cafeId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      category: r.category,
      priceKurus: r.priceKurus,
      available: r.available,
      description: r.description,
      imageUrl: r.imageUrl,
    }));
  }

  async setMenu(cafeId: string, items: MenuItem[]): Promise<void> {
    const db = this.db();
    await db.menuItem.deleteMany({ where: { cafeId } });
    await db.menuItem.createMany({
      data: items.map((item, sortOrder) => ({
        cafeId,
        productId: item.productId,
        name: item.name,
        category: item.category,
        priceKurus: item.priceKurus,
        available: item.available,
        description: item.description ?? null,
        imageUrl: item.imageUrl ?? null,
        sortOrder,
      })),
    });
  }
}
