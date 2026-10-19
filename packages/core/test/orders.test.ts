import { describe, expect, it } from "vitest";
import { InMemoryOrderStore, lineTotal, orderProblem, orderTotals, type Order, type OrderLine } from "../src";

const line = (unitPriceKurus: number, quantity: number, discountPercent = 0): OrderLine => ({
  productId: `p${unitPriceKurus}`,
  name: "x",
  unitPriceKurus,
  quantity,
  discountPercent,
});

describe("order totals (plan piece 6)", () => {
  it("rounds each discount half up to the kuruş, so till, receipt and reports agree", () => {
    expect(lineTotal(line(333, 1, 50))).toBe(166); // 166,5 off rounds up to 167
    // 1.167 after the line discount; 583,5 off rounds up to 584.
    expect(orderTotals([line(333, 1, 50), line(1_001, 1)], 50)).toEqual({ subtotalKurus: 1_334, discountKurus: 751, totalKurus: 583 });
    expect(orderTotals([line(12_000, 2)], 0)).toEqual({ subtotalKurus: 24_000, discountKurus: 0, totalKurus: 24_000 });
    expect(orderTotals([line(12_000, 2, 100)], 0).totalKurus).toBe(0);
  });

  it("names what's wrong with an order", () => {
    expect(orderProblem([], 0)).toBe("ORDER_EMPTY");
    expect(orderProblem([{ quantity: 0, discountPercent: 0 }], 0)).toBe("QUANTITY_INVALID");
    expect(orderProblem([{ quantity: 1, discountPercent: 2.5 }], 0)).toBe("DISCOUNT_INVALID");
    expect(orderProblem([{ quantity: 1, discountPercent: 0 }], -1)).toBe("DISCOUNT_INVALID");
    expect(orderProblem(Array.from({ length: 101 }, () => ({ quantity: 1, discountPercent: 0 })), 0)).toBe("TOO_MANY_LINES");
    expect(orderProblem([{ quantity: 99, discountPercent: 100 }], 100)).toBeNull();
  });
});

describe("InMemoryOrderStore", () => {
  const blank = (id: string, number: number, cafeId = "c1", businessDay = "2026-10-16"): Order => ({
    id, cafeId, number, businessDay, status: "open", lines: [line(100, 1)], discountPercent: 0,
    subtotalKurus: 100, discountKurus: 0, totalKurus: 100, createdAt: new Date(2026, 9, 16, 9, number), createdByMemberId: "m",
    createKey: `k-${id}`, paidAt: null, paidByMemberId: null, paymentMethod: null, tenderedKurus: null, changeKurus: null, payKey: null,
    voidedAt: null, voidedByMemberId: null, voidReason: null, refundedAt: null, refundedByMemberId: null, refundReason: null,
    refundKurus: null, deletedAt: null, deletedByMemberId: null, deleteReason: null,
  });

  it("counts per café and day, lists newest first and never shows deleted orders", async () => {
    const store = new InMemoryOrderStore();
    expect([await store.nextNumber("c1", "d1"), await store.nextNumber("c1", "d1"), await store.nextNumber("c2", "d1"), await store.nextNumber("c1", "d2")]).toEqual([1, 2, 1, 1]);
    await store.saveOrder(blank("a", 1));
    await store.saveOrder(blank("b", 2));
    await store.saveOrder({ ...blank("c", 3), deletedAt: new Date() });
    await store.saveOrder(blank("d", 1, "c2"));
    expect((await store.listOrders("c1")).map((o) => o.id)).toEqual(["b", "a"]);
    expect(await store.getOrder("c2", "a")).toBeNull();
    expect((await store.findByCreateKey("c1", "k-b"))?.id).toBe("b");
  });
});
