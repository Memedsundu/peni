import { beforeEach, describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now });
  await seed(app);
  leyla = await at("leyla");
});

describe("menu (plan piece 5)", () => {
  it("shows categories in order with their products, and which are on the askı", async () => {
    const menu = await app.menuEditor.view(leyla);
    expect(menu.categories.map((c) => [c.name, c.productCount])).toEqual([
      ["Sıcak", 4],
      ["Soğuk", 1],
      ["Yiyecek", 1],
      ["Tatlı", 1],
    ]);
    expect(menu.products.map((p) => p.productId)).toEqual(["cay", "turk", "filtre", "latte", "limonata", "simit", "cheesecake"]);
    expect(menu.products.find((p) => p.productId === "cay")).toMatchObject({ category: "Sıcak", priceKurus: 3_000, askida: true });
    expect(menu.removed).toEqual([]);
  });

  it("lets the owner and manager edit, not the chef or barista", async () => {
    expect((await app.menuEditor.view(await at("murat"))).products.length).toBe(7);
    expect(await code(app.menuEditor.view(await at("hakan")))).toBe("FORBIDDEN");
    expect(await code(app.menuEditor.addCategory(await at("ece"), { name: "Kahvaltı" }))).toBe("FORBIDDEN");
  });

  it("follows the owner's role switches", async () => {
    await app.staff.saveRoles(leyla, { chef: { "menu.edit": true } });
    expect((await app.menuEditor.view(await at("hakan"))).products.length).toBe(7);
  });

  it("adds, renames and orders categories; names are unique the Turkish way", async () => {
    let menu = await app.menuEditor.addCategory(leyla, { name: "  Kahvaltı " });
    const breakfast = menu.categories.at(-1)!;
    expect(breakfast).toMatchObject({ name: "Kahvaltı", productCount: 0 });
    expect(await code(app.menuEditor.addCategory(leyla, { name: "SICAK" }))).toBe("CATEGORY_EXISTS");
    expect(await code(app.menuEditor.addCategory(leyla, { name: "   " }))).toBe("NAME_REQUIRED");
    expect(await code(app.menuEditor.renameCategory(leyla, breakfast.id, { name: "tatlı" }))).toBe("CATEGORY_EXISTS");
    menu = await app.menuEditor.renameCategory(leyla, breakfast.id, { name: "Sabah" });
    menu = await app.menuEditor.reorder(leyla, { categoryIds: [breakfast.id, ...menu.categories.slice(0, -1).map((c) => c.id)] });
    expect(menu.categories.map((c) => c.name)).toEqual(["Sabah", "Sıcak", "Soğuk", "Yiyecek", "Tatlı"]);
    expect(await code(app.menuEditor.reorder(leyla, { categoryIds: ["cat_nope"] }))).toBe("CATEGORY_NOT_FOUND");
  });

  it("adds a product at the end of its category and checks what was typed", async () => {
    const cold = (await app.menuEditor.view(leyla)).categories.find((c) => c.name === "Soğuk")!;
    const menu = await app.menuEditor.addProduct(leyla, { name: "Soğuk Demleme", categoryId: cold.id, priceKurus: 14_550, description: " 18 saat demlenir " });
    const added = menu.products.find((p) => p.name === "Soğuk Demleme")!;
    expect(added).toMatchObject({ category: "Soğuk", priceKurus: 14_550, available: true, description: "18 saat demlenir", askida: false });
    expect(added.productId).toMatch(/^prd_/);
    expect(menu.products.filter((p) => p.categoryId === cold.id).map((p) => p.name)).toEqual(["Ev Limonatası", "Soğuk Demleme"]);
    expect(await code(app.menuEditor.addProduct(leyla, { name: "X", categoryId: cold.id, priceKurus: -1 }))).toBe("PRICE_INVALID");
    expect(await code(app.menuEditor.addProduct(leyla, { name: "X", categoryId: cold.id, priceKurus: 1.5 }))).toBe("PRICE_INVALID");
    expect(await code(app.menuEditor.addProduct(leyla, { name: "X", categoryId: "cat_nope", priceKurus: 100 }))).toBe("CATEGORY_NOT_FOUND");
    expect(await code(app.menuEditor.addProduct(leyla, { name: "X", categoryId: cold.id, priceKurus: 100, imageUrl: "http://x.test/a.jpg" }))).toBe("IMAGE_URL_INVALID");
    const kuzguncuk = await app.menuEditor.view(await at("leyla", "kuzguncuk"));
    expect(kuzguncuk.products.some((p) => p.name === "Soğuk Demleme")).toBe(false);
  });

  it("changes a price, and the customer pages and askı read the new one", async () => {
    await app.menuEditor.updateProduct(leyla, "cay", { priceKurus: 3_500 });
    const page = await app.cafeDetail("moda", null);
    expect(page.menu.find((m) => m.productId === "cay")!.priceKurus).toBe(3_500);
    expect(page.refItems[0]).toEqual({ name: "Çay", priceKurus: 3_500 });
  });

  it("turns a product off without removing it, and moves it between categories", async () => {
    let menu = await app.menuEditor.updateProduct(leyla, "latte", { available: false });
    expect(menu.products.find((p) => p.productId === "latte")!.available).toBe(false);
    expect((await app.cafeDetail("moda", null)).menu.find((m) => m.productId === "latte")!.available).toBe(false);
    const cold = menu.categories.find((c) => c.name === "Soğuk")!;
    menu = await app.menuEditor.updateProduct(leyla, "latte", { categoryId: cold.id, name: "Buzlu Latte" });
    expect(menu.products.filter((p) => p.categoryId === cold.id).map((p) => p.name)).toEqual(["Ev Limonatası", "Buzlu Latte"]);
    expect(await code(app.menuEditor.updateProduct(leyla, "yok", { available: true }))).toBe("PRODUCT_NOT_FOUND");
  });

  it("removes a product from the menu, keeps it, and brings it back", async () => {
    let menu = await app.menuEditor.updateProduct(leyla, "cheesecake", { removed: true });
    expect(menu.products.some((p) => p.productId === "cheesecake")).toBe(false);
    expect(menu.removed.map((p) => p.productId)).toEqual(["cheesecake"]);
    expect((await app.cafeDetail("moda", null)).menu.some((m) => m.productId === "cheesecake")).toBe(false);
    const sweets = menu.categories.find((c) => c.name === "Tatlı")!;
    expect(sweets.productCount).toBe(0);
    menu = await app.menuEditor.deleteCategory(leyla, sweets.id);
    expect(menu.removed[0]).toMatchObject({ productId: "cheesecake", categoryId: null });
    expect(await code(app.menuEditor.updateProduct(leyla, "cheesecake", { removed: false }))).toBe("CATEGORY_REQUIRED");
    const food = menu.categories.find((c) => c.name === "Yiyecek")!;
    menu = await app.menuEditor.updateProduct(leyla, "cheesecake", { removed: false, categoryId: food.id });
    expect(menu.products.filter((p) => p.categoryId === food.id).map((p) => p.productId)).toEqual(["simit", "cheesecake"]);
    expect(menu.removed).toEqual([]);
  });

  it("deletes only an empty category", async () => {
    const hot = (await app.menuEditor.view(leyla)).categories.find((c) => c.name === "Sıcak")!;
    expect(await code(app.menuEditor.deleteCategory(leyla, hot.id))).toBe("CATEGORY_NOT_EMPTY");
    expect(await code(app.menuEditor.deleteCategory(leyla, "cat_nope"))).toBe("CATEGORY_NOT_FOUND");
  });

  it("orders products within a category", async () => {
    const menu = await app.menuEditor.reorder(leyla, { productIds: ["latte", "filtre", "turk", "cay"] });
    expect(menu.products.slice(0, 4).map((p) => p.productId)).toEqual(["latte", "filtre", "turk", "cay"]);
    expect(await code(app.menuEditor.reorder(leyla, { productIds: ["nope"] }))).toBe("PRODUCT_NOT_FOUND");
  });
});
