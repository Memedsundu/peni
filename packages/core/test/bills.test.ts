import { describe, expect, it } from "vitest";
import { billState, billStock, compactIban, stockDifference, supplierProblem, unitCost, validDate } from "../src";

describe("bills (plan piece 18)", () => {
  it("prices a line per kg, litre or piece, and not a line without an amount", () => {
    expect(unitCost({ qtyMilli: 12_000, totalKurus: 54_000 })).toBe(4_500);
    expect(unitCost({ qtyMilli: 250, totalKurus: 22_500 })).toBe(90_000);
    expect(unitCost({ qtyMilli: null, totalKurus: 385_000 })).toBeNull();
  });

  it("moves stock by the difference when a bill is corrected", () => {
    const before = billStock([
      { itemId: "milk", qtyMilli: 10_000 },
      { itemId: "cups", qtyMilli: 500_000 },
      { itemId: null, qtyMilli: null },
    ]);
    const after = billStock([
      { itemId: "milk", qtyMilli: 8_000 },
      { itemId: "beans", qtyMilli: 1_000 },
      { itemId: "cups", qtyMilli: 500_000 },
    ]);
    expect(stockDifference(before, after)).toEqual(
      new Map([
        ["milk", -2_000],
        ["beans", 1_000],
      ]),
    );
  });

  it("calls a bill overdue only after its due day, in the café's dates", () => {
    const bill = { voidedAt: null, paidAt: null, dueDate: "2026-10-14" };
    expect(billState(bill, "2026-10-14")).toBe("unpaid");
    expect(billState(bill, "2026-10-15")).toBe("overdue");
    expect(billState({ ...bill, paidAt: new Date() }, "2026-10-15")).toBe("paid");
    expect(billState({ ...bill, voidedAt: new Date(), paidAt: new Date() }, "2026-10-15")).toBe("voided");
  });

  it("checks a supplier's numbers", () => {
    const s = {
      name: "Kuzey Kahve",
      phone: "0216 345 67 89",
      email: "siparis@kuzey.test",
      taxNo: "5730412298",
      iban: compactIban("tr33 0006 1005 1978 6457 8413 26"),
    };
    expect(supplierProblem(s)).toBeNull();
    expect(supplierProblem({ ...s, name: " " })).toBe("NAME_EMPTY");
    expect(supplierProblem({ ...s, phone: "call me" })).toBe("PHONE_INVALID");
    expect(supplierProblem({ ...s, email: "kuzey" })).toBe("EMAIL_INVALID");
    expect(supplierProblem({ ...s, taxNo: "12345" })).toBe("TAX_NO_INVALID");
    expect(supplierProblem({ ...s, iban: "DE89370400440532013000" })).toBe("IBAN_INVALID");
  });

  it("knows a real calendar date", () => {
    expect(validDate("2026-10-18")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
    expect(validDate("2026-10-1")).toBe(false);
  });
});
