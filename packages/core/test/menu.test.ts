import { describe, expect, it } from "vitest";
import { InMemoryMenuStore, MAX_PRICE_KURUS, categoryProblem, productProblem, sameMenuName } from "../src/menu";

describe("menu rules", () => {
  const ok = { name: "Çay", priceKurus: 3_000 };

  it("accepts a plain product and free ones", () => {
    expect(productProblem(ok)).toBeNull();
    expect(productProblem({ ...ok, priceKurus: 0 })).toBeNull();
    expect(productProblem({ ...ok, priceKurus: MAX_PRICE_KURUS, imageUrl: "https://img.test/cay.jpg" })).toBeNull();
  });

  it("names what's wrong", () => {
    expect(productProblem({ ...ok, name: "  " })).toBe("NAME_EMPTY");
    expect(productProblem({ ...ok, name: "x".repeat(61) })).toBe("NAME_TOO_LONG");
    expect(productProblem({ ...ok, priceKurus: -1 })).toBe("PRICE_INVALID");
    expect(productProblem({ ...ok, priceKurus: 12.5 })).toBe("PRICE_INVALID");
    expect(productProblem({ ...ok, priceKurus: MAX_PRICE_KURUS + 1 })).toBe("PRICE_INVALID");
    expect(productProblem({ ...ok, description: "x".repeat(281) })).toBe("DESCRIPTION_TOO_LONG");
    expect(productProblem({ ...ok, imageUrl: "javascript:alert(1)" })).toBe("IMAGE_URL_INVALID");
    expect(categoryProblem("")).toBe("NAME_EMPTY");
  });

  it("compares names the Turkish way", () => {
    expect(sameMenuName("Sıcak", " SICAK ")).toBe(true);
    expect(sameMenuName("İçecek", "içecek")).toBe(true);
    expect(sameMenuName("Sicak", "Sıcak")).toBe(false);
  });
});

describe("InMemoryMenuStore", () => {
  it("lists by category order, then product order, and hides removed products unless asked", async () => {
    const store = new InMemoryMenuStore();
    await store.saveCategory({ id: "c2", cafeId: "a", name: "Soğuk", sortOrder: 1 });
    await store.saveCategory({ id: "c1", cafeId: "a", name: "Sıcak", sortOrder: 0 });
    await store.saveCategory({ id: "x", cafeId: "b", name: "Başka", sortOrder: 0 });
    const p = { category: "", available: true };
    await store.saveProduct("a", { ...p, productId: "limonata", name: "Limonata", categoryId: "c2", priceKurus: 1, sortOrder: 0 });
    await store.saveProduct("a", { ...p, productId: "turk", name: "Türk", categoryId: "c1", priceKurus: 1, sortOrder: 1 });
    await store.saveProduct("a", { ...p, productId: "cay", name: "Çay", categoryId: "c1", priceKurus: 1, sortOrder: 0 });
    await store.saveProduct("a", { ...p, productId: "eski", name: "Eski", categoryId: "c1", priceKurus: 1, archivedAt: new Date() });
    await store.saveProduct("b", { ...p, productId: "cay", name: "Çay B", categoryId: "x", priceKurus: 1 });
    expect((await store.listMenu("a")).map((m) => `${m.category}/${m.productId}`)).toEqual(["Sıcak/cay", "Sıcak/turk", "Soğuk/limonata"]);
    expect((await store.listMenu("a", { includeArchived: true })).map((m) => m.productId)).toContain("eski");
    expect((await store.getProduct("b", "cay"))!.name).toBe("Çay B");
    await store.deleteCategory("a", "c1");
    expect((await store.getProduct("a", "eski"))!.categoryId).toBeNull();
    expect((await store.getProduct("b", "cay"))!.categoryId).toBe("x");
  });
});
