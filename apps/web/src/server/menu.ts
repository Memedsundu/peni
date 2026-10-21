import type { StaffMenuDTO, StaffMenuProductDTO } from "@peni/api";
import {
  categoryProblem,
  productProblem,
  sameMenuName,
  type MenuItem,
  type MenuProblem,
  type MenuStore,
  type PeniDirectory,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import { requirePermission, type StaffContext } from "./staff";

/**
 * The café panel's Menü (plan piece 5): categories, products, prices, on or off.
 * Every change needs "menu.edit" (owner and manager by default, D26) and answers
 * with the whole menu, so screens never show a stale list.
 */
export class MenuService {
  constructor(
    private readonly store: MenuStore,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

  async view(ctx: StaffContext): Promise<StaffMenuDTO> {
    this.require(ctx);
    const cafeId = ctx.cafe.id;
    const [categories, products, settings] = await Promise.all([
      this.store.listCategories(cafeId),
      this.store.listMenu(cafeId, { includeArchived: true }),
      this.directory.getSettings(cafeId),
    ]);
    const askida = new Set(settings.askidaEnabled ? settings.askidaProductIds : []);
    const dto = (p: MenuItem): StaffMenuProductDTO => ({
      productId: p.productId,
      name: p.name,
      categoryId: p.categoryId,
      category: p.category,
      priceKurus: p.priceKurus,
      available: p.available,
      description: p.description ?? null,
      imageUrl: p.imageUrl ?? null,
      askida: askida.has(p.productId),
    });
    const live = products.filter((p) => !p.archivedAt);
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, productCount: live.filter((p) => p.categoryId === c.id).length })),
      products: live.map(dto),
      removed: products.filter((p) => p.archivedAt).map(dto),
    };
  }

  async addCategory(ctx: StaffContext, input: { name: string }): Promise<StaffMenuDTO> {
    this.require(ctx);
    const categories = await this.store.listCategories(ctx.cafe.id);
    const name = this.categoryName(input.name, categories, null);
    await this.store.saveCategory({
      id: `cat_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      name,
      sortOrder: Math.max(-1, ...categories.map((c) => c.sortOrder)) + 1,
    });
    return this.view(ctx);
  }

  async renameCategory(ctx: StaffContext, categoryId: string, input: { name: string }): Promise<StaffMenuDTO> {
    this.require(ctx);
    const categories = await this.store.listCategories(ctx.cafe.id);
    const category = categories.find((c) => c.id === categoryId);
    if (!category) throw new AppError("CATEGORY_NOT_FOUND", "No such category", 404);
    await this.store.saveCategory({ ...category, name: this.categoryName(input.name, categories, categoryId) });
    return this.view(ctx);
  }

  /** Only an empty category goes, as in Shelby. Products removed from the menu don't count. */
  async deleteCategory(ctx: StaffContext, categoryId: string): Promise<StaffMenuDTO> {
    this.require(ctx);
    const categories = await this.store.listCategories(ctx.cafe.id);
    if (!categories.some((c) => c.id === categoryId)) throw new AppError("CATEGORY_NOT_FOUND", "No such category", 404);
    const live = await this.store.listMenu(ctx.cafe.id);
    if (live.some((p) => p.categoryId === categoryId)) {
      throw new AppError("CATEGORY_NOT_EMPTY", "Move or remove its products first", 409);
    }
    await this.store.deleteCategory(ctx.cafe.id, categoryId);
    return this.view(ctx);
  }

  async addProduct(
    ctx: StaffContext,
    input: { name: string; categoryId: string; priceKurus: number; available?: boolean; description?: string | null; imageUrl?: string | null },
  ): Promise<StaffMenuDTO> {
    this.require(ctx);
    await this.requireCategory(ctx, input.categoryId);
    const product: MenuItem = {
      productId: `prd_${randomUUID()}`,
      name: input.name.trim(),
      categoryId: input.categoryId,
      category: "",
      priceKurus: input.priceKurus,
      available: input.available ?? true,
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl || null,
      sortOrder: await this.nextProductOrder(ctx, input.categoryId),
      archivedAt: null,
    };
    this.check(productProblem(product));
    await this.store.saveProduct(ctx.cafe.id, product);
    return this.view(ctx);
  }

  /** Changes only what was sent. `removed: true` takes it off the menu; `false` brings it back. */
  async updateProduct(
    ctx: StaffContext,
    productId: string,
    input: {
      name?: string;
      categoryId?: string;
      priceKurus?: number;
      available?: boolean;
      description?: string | null;
      imageUrl?: string | null;
      removed?: boolean;
    },
  ): Promise<StaffMenuDTO> {
    this.require(ctx);
    const current = await this.store.getProduct(ctx.cafe.id, productId);
    if (!current) throw new AppError("PRODUCT_NOT_FOUND", "No such product", 404);
    const next: MenuItem = { ...current };
    if (input.name !== undefined) next.name = input.name.trim();
    if (input.priceKurus !== undefined) next.priceKurus = input.priceKurus;
    if (input.available !== undefined) next.available = input.available;
    if (input.description !== undefined) next.description = input.description?.trim() || null;
    if (input.imageUrl !== undefined) next.imageUrl = input.imageUrl || null;
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await this.requireCategory(ctx, input.categoryId);
      next.categoryId = input.categoryId;
      next.sortOrder = await this.nextProductOrder(ctx, input.categoryId);
    }
    if (input.removed === true && !current.archivedAt) next.archivedAt = this.now();
    if (input.removed === false && current.archivedAt) {
      // Brought back into a category that was deleted meanwhile: it needs a new one.
      if (!next.categoryId) throw new AppError("CATEGORY_REQUIRED", "Choose a category for it", 400);
      next.archivedAt = null;
      next.sortOrder = await this.nextProductOrder(ctx, next.categoryId);
    }
    this.check(productProblem(next));
    await this.store.saveProduct(ctx.cafe.id, next);
    return this.view(ctx);
  }

  /**
   * Drag-and-drop order. `categoryIds` lists categories top to bottom; `productIds`
   * lists the products of one category top to bottom. Ids it doesn't know are refused.
   */
  async reorder(ctx: StaffContext, input: { categoryIds?: string[]; productIds?: string[] }): Promise<StaffMenuDTO> {
    this.require(ctx);
    const cafeId = ctx.cafe.id;
    if (input.categoryIds) {
      const categories = await this.store.listCategories(cafeId);
      const byId = new Map(categories.map((c) => [c.id, c]));
      if (input.categoryIds.some((id) => !byId.has(id))) throw new AppError("CATEGORY_NOT_FOUND", "No such category", 404);
      for (const [i, id] of input.categoryIds.entries()) await this.store.saveCategory({ ...byId.get(id)!, sortOrder: i });
    }
    if (input.productIds) {
      const live = await this.store.listMenu(cafeId);
      const byId = new Map(live.map((p) => [p.productId, p]));
      if (input.productIds.some((id) => !byId.has(id))) throw new AppError("PRODUCT_NOT_FOUND", "No such product", 404);
      for (const [i, id] of input.productIds.entries()) await this.store.saveProduct(cafeId, { ...byId.get(id)!, sortOrder: i });
    }
    return this.view(ctx);
  }

  private categoryName(raw: string, categories: { id: string; name: string }[], self: string | null): string {
    this.check(categoryProblem(raw));
    const name = raw.trim();
    if (categories.some((c) => c.id !== self && sameMenuName(c.name, name))) {
      throw new AppError("CATEGORY_EXISTS", "There is already a category with this name", 409);
    }
    return name;
  }

  private async requireCategory(ctx: StaffContext, categoryId: string): Promise<void> {
    if (!(await this.store.listCategories(ctx.cafe.id)).some((c) => c.id === categoryId)) {
      throw new AppError("CATEGORY_NOT_FOUND", "No such category", 404);
    }
  }

  private async nextProductOrder(ctx: StaffContext, categoryId: string): Promise<number> {
    const inCategory = (await this.store.listMenu(ctx.cafe.id)).filter((p) => p.categoryId === categoryId);
    return Math.max(-1, ...inCategory.map((p) => p.sortOrder ?? 0)) + 1;
  }

  private check(problem: MenuProblem | null): void {
    if (!problem) return;
    const code = problem === "NAME_EMPTY" ? "NAME_REQUIRED" : problem;
    throw new AppError(code, "Check the menu details", 400);
  }

  private require(ctx: StaffContext): void {
    requirePermission(ctx, "menu.edit");
  }
}
