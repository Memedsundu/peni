import { describe, expect, it } from "vitest";
import { StandalonePosAdapter } from "../src";

const order = (peniOrderId: string) => ({
  cafeId: "cafe_moda",
  peniOrderId,
  customerDisplayName: "Ayşe",
  lines: [{ productId: "cay", quantity: 1, unitPriceKurus: 3_000 }],
  customerNote: null,
  peniDiscountKurus: 0,
  askidaKurus: 0,
});

describe("standalone order numbers", () => {
  it("count up per café and restart at P-001 every local day", async () => {
    let now = new Date("2026-10-15T18:00:00Z"); // 21:00 in Istanbul
    const pos = new StandalonePosAdapter({ clock: () => now });
    expect((await pos.createPendingOrder(order("a"))).orderNumber).toBe("P-001");
    expect((await pos.createPendingOrder(order("b"))).orderNumber).toBe("P-002");
    expect((await pos.createPendingOrder({ ...order("c"), cafeId: "cafe_other" })).orderNumber).toBe("P-001");
    now = new Date("2026-10-15T21:05:00Z"); // 00:05 the next day in Istanbul
    expect((await pos.createPendingOrder(order("d"))).orderNumber).toBe("P-001");
  });
});
