import { describe, expect, it } from "vitest";
import { amountPaid, InMemoryPaymentStore, manualTerminal, type Payment } from "../src";

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "pay_1",
  cafeId: "cafe_moda",
  orderId: "ord_1",
  kind: "sale",
  method: "card",
  amountKurus: 12_000,
  tenderedKurus: null,
  changeKurus: null,
  status: "pending",
  terminal: "manual",
  deviceId: null,
  key: "k1",
  reason: null,
  startedAt: new Date("2026-10-16T09:00:00Z"),
  startedByMemberId: "m1",
  settledAt: null,
  settledByMemberId: null,
  reference: null,
  receiptNo: null,
  failure: null,
  ...over,
});

describe("payments (plan piece 8)", () => {
  it("counts approved sales less approved refunds", () => {
    expect(
      amountPaid([
        payment({ status: "approved" }),
        payment({ status: "declined" }),
        payment({ status: "approved", kind: "refund", amountKurus: 2_000 }),
        payment({ status: "pending", kind: "refund" }),
      ]),
    ).toBe(10_000);
  });

  it("takes cash and refunds at once on the manual terminal and waits for the barista on a card", () => {
    expect(manualTerminal.confirmation({ kind: "sale", method: "cash" })).toBe("now");
    expect(manualTerminal.confirmation({ kind: "sale", method: "card" })).toBe("staff");
    expect(manualTerminal.confirmation({ kind: "refund", method: "card" })).toBe("now");
  });

  it("keeps one payment per key at a café", async () => {
    const store = new InMemoryPaymentStore();
    expect(await store.savePayment(payment())).toBe(true);
    expect(await store.savePayment(payment({ id: "pay_2" }))).toBe(false);
    expect(await store.savePayment(payment({ id: "pay_3", cafeId: "cafe_kuzguncuk" }))).toBe(true);
    expect(await store.savePayment(payment({ status: "approved" }))).toBe(true);
    expect((await store.findPaymentByKey("cafe_moda", "k1"))!.status).toBe("approved");
    expect((await store.listPayments("cafe_moda", ["ord_1"])).map((p) => p.id)).toEqual(["pay_1"]);
  });
});
