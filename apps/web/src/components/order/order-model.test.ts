import type { OrderDTO, OrderLineDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import {
  askiItemName,
  documentTitle,
  fisLines,
  groupByDay,
  itemsSummary,
  paidQuantities,
  reorderHref,
  usualLabel,
  usualOrderIds,
  voidNotes,
} from "./order-model";

const line = (productId: string, name: string, unitPriceKurus: number, quantity = 1, fromAskida = false): OrderLineDTO => ({
  productId,
  name,
  unitPriceKurus,
  quantity,
  note: null,
  fromAskida,
});

function order(over: Partial<OrderDTO> = {}): OrderDTO {
  return {
    id: "ord_1",
    cafeSlug: "moda",
    cafeName: "Moda Kahvesi",
    orderNumber: "P-003",
    status: "submitted",
    customerName: "Ayşe Yılmaz",
    lines: [line("latte", "Latte", 12_000), line("simit", "Simit", 2_500)],
    subtotalKurus: 14_500,
    peniDiscountKurus: 0,
    askidaKurus: 0,
    dueKurus: 14_500,
    customerNote: null,
    rejectionReason: null,
    submittedAt: "2026-10-16T11:02:00.000Z",
    acceptedAt: null,
    readyAt: null,
    closedAt: null,
    earnedPeni: null,
    memberCode: "M7K-42Q",
    ...over,
  };
}

// Two çay, one of them from the askı, as the server splits it.
const withIkram = [line("cay", "Çay", 3_000), line("cay", "Çay", 3_000, 1, true), line("simit", "Simit", 2_500)];

describe("fisLines", () => {
  it("merges the askı unit back into its product (no '(askıdan)' line)", () => {
    expect(fisLines(withIkram).map((l) => [l.name, l.quantity, l.totalKurus])).toEqual([
      ["Çay", 2, 6_000],
      ["Simit", 1, 2_500],
    ]);
  });
});

describe("reorder", () => {
  it("never claims the ikram again", () => {
    expect(paidQuantities(withIkram)).toEqual([
      { productId: "cay", name: "Çay", quantity: 1 },
      { productId: "simit", name: "Simit", quantity: 1 },
    ]);
    expect(reorderHref(order({ lines: withIkram }))).toBe("/k/moda?sepet=cay:1,simit:1");
  });

  it("links to the café alone when only an ikram was ordered", () => {
    expect(reorderHref(order({ lines: [line("cay", "Çay", 3_000, 1, true)] }))).toBe("/k/moda");
    expect(usualLabel([line("cay", "Çay", 3_000, 1, true)])).toBeNull();
  });

  it("reads 'Her zamanki: Latte + Simit'", () => {
    expect(usualLabel(order().lines)).toBe("Her zamanki: Latte + Simit");
    expect(usualLabel([line("turk", "Türk Kahvesi", 9_000, 2)])).toBe("Her zamanki: 2 × Türk Kahvesi");
  });
});

describe("history", () => {
  it("lists every product once", () => {
    expect(itemsSummary(withIkram)).toBe("Çay, Simit");
  });

  it("gives 'Her zamanki' to the newest collected order per café", () => {
    const orders = [
      order({ id: "a", status: "collected", submittedAt: "2026-10-10T10:00:00Z" }),
      order({ id: "b", status: "collected", submittedAt: "2026-10-12T10:00:00Z" }),
      order({ id: "c", status: "rejected", submittedAt: "2026-10-14T10:00:00Z" }),
      order({ id: "d", status: "collected", cafeSlug: "kuzguncuk", submittedAt: "2026-10-01T10:00:00Z" }),
    ];
    expect([...usualOrderIds(orders)].sort()).toEqual(["b", "d"]);
  });

  it("groups by relDay, newest first", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    const groups = groupByDay(
      [
        order({ id: "old", submittedAt: "2026-10-01T09:00:00Z" }),
        order({ id: "today1", submittedAt: "2026-10-16T08:00:00Z" }),
        order({ id: "yday", submittedAt: "2026-10-15T08:00:00Z" }),
        order({ id: "today2", submittedAt: "2026-10-16T10:00:00Z" }),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.orders.map((o) => o.id)])).toEqual([
      ["Bugün", ["today2", "today1"]],
      ["Dün", ["yday"]],
      ["1 Eki", ["old"]],
    ]);
  });
});

describe("copy", () => {
  it("titles the tab 'Hazır · P-003' only while ready", () => {
    expect(documentTitle(order({ status: "ready" }))).toBe("Hazır · P-003");
    expect(documentTitle(order({ status: "accepted" }))).toBe("Sipariş P-003 · Peni");
  });

  it("says what went back after a rejection", () => {
    const o = order({ status: "rejected", rejectionReason: "Malzeme bitti", peniDiscountKurus: 9_000, askidaKurus: 3_000, lines: withIkram });
    expect(askiItemName(o)).toBe("Çay");
    expect(voidNotes(o)).toEqual({
      note: "Kafenin notu: Malzeme bitti",
      lines: ["Kullandığın 90 penin cüzdanına döndü.", "Askıdaki çay yerine döndü."],
    });
  });

  it("only mentions peni going back when peni was used", () => {
    expect(voidNotes(order({ status: "cancelled" })).lines).toEqual([]);
    expect(voidNotes(order({ status: "cancelled", peniDiscountKurus: 3_000 })).lines).toEqual(["Kullandığın peni cüzdanına döndü."]);
    expect(voidNotes(order({ status: "no_show" })).lines).toEqual([
      "Üst üste iki sipariş teslim alınmazsa bu kafede önden sipariş kapanır.",
    ]);
    expect(voidNotes(order({ status: "no_show", peniDiscountKurus: 3_000 })).lines.join(" ")).toBe(
      "Kullandığın peni cüzdanına döndü. Üst üste iki sipariş teslim alınmazsa bu kafede önden sipariş kapanır.",
    );
  });
});
