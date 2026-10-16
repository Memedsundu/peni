import type { CafeDetailDTO, MenuItemDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import { cartTotals, EMPTY_CART, joinNames, orderInput, parseSepet, type CartState } from "./cart";

const item = (productId: string, name: string, priceKurus: number, extra: Partial<MenuItemDTO> = {}): MenuItemDTO => ({
  productId,
  name,
  category: "Sıcak",
  priceKurus,
  available: true,
  description: null,
  askida: false,
  ...extra,
});

function cafe(over: Partial<CafeDetailDTO> = {}, balancePeni = 90): CafeDetailDTO {
  return {
    id: "cafe_moda",
    slug: "moda",
    name: "Moda Kahvesi",
    district: "Kadıköy",
    city: "İstanbul",
    coverImageUrl: null,
    acceptingOrders: true,
    askidaItemsAvailable: 3,
    isMember: true,
    balancePeni,
    earnRatePercent: 5,
    refItems: [{ name: "Çay", priceKurus: 3000 }],
    nextEvent: null,
    hue: null,
    address: "Moda Cd. No: 42",
    maxRedeemSharePercent: 100,
    menu: [item("cay", "Çay", 3000, { askida: true }), item("latte", "Latte", 12000), item("simit", "Simit", 2500, { available: false })],
    askida: {} as CafeDetailDTO["askida"],
    posts: [],
    membership: { id: "m", balancePeni, preorderEnabled: true, joinedAt: "", noShowStrikes: 0, memberCode: "AAA-111" },
    medianPrepMinutes: null,
    prepMinutesRange: null,
    ...over,
  };
}

const state = (over: Partial<CartState>): CartState => ({ ...EMPTY_CART, ...over });

describe("cartTotals", () => {
  it("adds lines in menu order and earns on the due amount (D12)", () => {
    const t = cartTotals(cafe(), state({ lines: { latte: 1, cay: 1 } }));
    expect(t.lines.map((l) => l.item.productId)).toEqual(["cay", "latte"]);
    expect(t.count).toBe(2);
    expect(t.subtotalKurus).toBe(15000);
    expect(t.dueKurus).toBe(15000);
    expect(t.earn).toBe(7); // floor(15000 × 5 / 10000)
  });

  it("merges the ikram unit into its product line and takes it off the due amount", () => {
    const t = cartTotals(cafe(), state({ lines: { cay: 1, latte: 1 }, ikram: "cay" }));
    const cay = t.lines.find((l) => l.item.productId === "cay")!;
    expect(cay).toMatchObject({ qty: 2, paid: 1, ikram: true, totalKurus: 6000 });
    expect(t.askidaKurus).toBe(3000);
    expect(t.count).toBe(3);
    expect(t.dueKurus).toBe(15000);
  });

  it("caps the peni toggle (D13) and only applies it when on", () => {
    const off = cartTotals(cafe({ maxRedeemSharePercent: 50 }), state({ lines: { latte: 1 } }));
    expect(off.usable).toBe(60);
    expect(off.capped).toBe(true);
    expect(off.appliedPeni).toBe(0);
    const on = cartTotals(cafe({ maxRedeemSharePercent: 50 }), state({ lines: { latte: 1 }, usePeni: true }));
    expect(on.appliedPeni).toBe(60);
    expect(on.dueKurus).toBe(6000);
    expect(on.earn).toBe(3);
  });

  it("never offers more peni than is due, and none for an ikram-only cart", () => {
    expect(cartTotals(cafe({}, 500), state({ lines: { cay: 1 } })).usable).toBe(30);
    expect(cartTotals(cafe(), state({ ikram: "cay" })).usable).toBe(0);
    expect(cartTotals(cafe(), state({ ikram: "cay" })).dueKurus).toBe(0);
  });

  it("keeps sold-out products out of the order and the totals", () => {
    const t = cartTotals(cafe(), state({ lines: { simit: 2, latte: 1 } }));
    expect(t.soldOut.map((m) => m.productId)).toEqual(["simit"]);
    expect(t.subtotalKurus).toBe(12000);
  });
});

describe("orderInput", () => {
  it("sends the ikram inside lines and as askidaProductId, with the applied peni", () => {
    const c = cafe();
    const s = state({ lines: { latte: 1 }, ikram: "cay", usePeni: true, note: "  az şekerli  " });
    const input = orderInput("moda", s, cartTotals(c, s), "key-12345678");
    expect(input).toEqual({
      cafeSlug: "moda",
      lines: [
        { productId: "cay", quantity: 1 },
        { productId: "latte", quantity: 1 },
      ],
      usePeni: 90,
      askidaProductId: "cay",
      customerNote: "az şekerli",
      idempotencyKey: "key-12345678",
    });
  });
});

describe("parseSepet / joinNames", () => {
  it("reads latte:1,simit:2 and skips bad pairs", () => {
    expect(parseSepet("latte:1,simit:2,:3,cay:x,filtre")).toEqual([
      ["latte", 1],
      ["simit", 2],
      ["filtre", 1],
    ]);
    expect(parseSepet(null)).toEqual([]);
    expect(parseSepet("latte:99")).toEqual([["latte", 20]]);
  });

  it("joins names the Turkish way", () => {
    expect(joinNames(["Simit"])).toBe("Simit");
    expect(joinNames(["Simit", "Latte"])).toBe("Simit ve Latte");
    expect(joinNames(["Simit", "Latte", "Çay"])).toBe("Simit, Latte ve Çay");
  });
});
