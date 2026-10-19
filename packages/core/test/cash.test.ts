import { describe, expect, it } from "vitest";
import { cashTotals, countTotal, InMemoryCashStore, type CashSession } from "../src";

const session = (id: string, closed = false): CashSession => {
  const count = { expectedKurus: null, countKurus: 10_000, differenceKurus: 0, counts: null, note: null, at: new Date(), byMemberId: "m1" };
  return { id, cafeId: "cafe_moda", opening: count, closing: closed ? count : null, openKey: `o-${id}`, closeKey: closed ? `c-${id}` : null };
};

describe("cash sessions (plan piece 9)", () => {
  it("adds up notes and coins and refuses what isn't Turkish money", () => {
    expect(countTotal({ "20000": 2, "500": 3, "5": 1 })).toBe(41_505);
    expect(countTotal({})).toBe(0);
    expect(countTotal({ "300": 1 })).toBeNull();
    expect(countTotal({ "100": 1.5 })).toBeNull();
  });

  it("expects the opening count plus cash in, less cash out; cards are counted apart", () => {
    const pay = (kind: "sale" | "refund", method: "cash" | "card", amountKurus: number, status = "approved" as const) => ({ kind, method, amountKurus, status });
    const totals = cashTotals(
      session("s1"),
      [pay("sale", "cash", 5_000), pay("sale", "card", 7_000), pay("refund", "cash", 1_000), { ...pay("sale", "cash", 9_999), status: "declined" as const }],
      [{ kind: "in", amountKurus: 2_000 }, { kind: "out", amountKurus: 500 }],
    );
    expect(totals).toEqual({ cashSalesKurus: 5_000, cashRefundsKurus: 1_000, inKurus: 2_000, outKurus: 500, cardSalesKurus: 7_000, cardRefundsKurus: 0, expectedKurus: 15_500 });
  });

  it("keeps one open drawer per café", async () => {
    const store = new InMemoryCashStore();
    expect(await store.saveSession(session("s1"))).toBe(true);
    expect(await store.saveSession(session("s2"))).toBe(false);
    expect(await store.saveSession(session("s1", true))).toBe(true);
    expect(await store.saveSession(session("s2"))).toBe(true);
    expect((await store.openSession("cafe_moda"))!.id).toBe("s2");
    expect((await store.lastClosed("cafe_moda"))!.id).toBe("s1");
  });
});
