import { describe, expect, it } from "vitest";
import { cardStatement, lenderKey, loansLeft } from "../src";

const card = { limitKurus: 10_000_000, statementDay: 26, dueDay: 5 };

describe("debts (plan piece 19)", () => {
  it("treats a lender's name the same however it is typed, and a team member by id", () => {
    expect(lenderKey({ memberId: null, name: "  İlker  Abi " })).toBe(lenderKey({ memberId: null, name: "ilker abi" }));
    expect(lenderKey({ memberId: "stm_1", name: "Murat" })).toBe("member:stm_1");
  });

  it("pays a lender's oldest loans first", () => {
    const at = new Date(0);
    const left = loansLeft(
      [
        { id: "b", amountKurus: 30_000, borrowedOn: "2026-10-10", createdAt: at },
        { id: "a", amountKurus: 50_000, borrowedOn: "2026-10-01", createdAt: at },
      ],
      60_000,
    );
    expect(left.map((l) => [l.id, l.leftKurus])).toEqual([
      ["a", 0],
      ["b", 20_000],
    ]);
  });

  it("works out the statement from its closing day, and what is late after the due day", () => {
    const charges = [
      { amountKurus: 370_000, paidOn: "2026-09-26" },
      { amountKurus: 50_000, paidOn: "2026-10-02" },
    ];
    const payments = [{ amountKurus: 200_000, paidOn: "2026-10-04" }];
    // Before the due day: the September statement is owed but not late yet.
    expect(cardStatement(card, charges, payments, "2026-10-04")).toEqual({
      balanceKurus: 220_000,
      remainingKurus: 9_780_000,
      lastClose: "2026-09-26",
      dueDate: "2026-10-05",
      statementKurus: 170_000,
      overdueKurus: 0,
      nextClose: "2026-10-26",
    });
    // The 5th has passed: what is left of it is late.
    expect(cardStatement(card, charges, payments, "2026-10-16")).toMatchObject({ statementKurus: 170_000, overdueKurus: 170_000 });
    // Paying more than the statement settles it and starts on the next one.
    expect(cardStatement(card, charges, [...payments, { amountKurus: 190_000, paidOn: "2026-10-16" }], "2026-10-16")).toMatchObject({
      balanceKurus: 30_000,
      statementKurus: 0,
      overdueKurus: 0,
    });
    // A new statement closes on the 26th; its due day is in November.
    expect(cardStatement(card, charges, payments, "2026-10-26")).toMatchObject({ lastClose: "2026-10-26", dueDate: "2026-11-05", statementKurus: 220_000 });
  });

  it("closes in the same month when the due day comes later in it, and across the new year", () => {
    expect(cardStatement({ ...card, statementDay: 3, dueDay: 13 }, [], [], "2026-10-02")).toMatchObject({
      lastClose: "2026-09-03",
      dueDate: "2026-09-13",
      nextClose: "2026-10-03",
    });
    expect(cardStatement(card, [], [], "2027-01-10")).toMatchObject({ lastClose: "2026-12-26", dueDate: "2027-01-05", nextClose: "2027-01-26" });
  });
});
