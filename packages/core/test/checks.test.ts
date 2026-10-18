import { describe, expect, it } from "vitest";
import { compareZ, dayDiff, matchStatement, zDiffers, type StatementRecord } from "../src/checks";

const rec = (id: string, day: string, amountKurus: number, kind = "bill"): StatementRecord => ({ id, day, amountKurus, kind, label: id, billId: null });
const line = (date: string, amountKurus: number) => ({ date, amountKurus });

describe("Matching a statement to Peni (plan piece 27)", () => {
  it("pairs lines with records of the same amount within a few days, the closest first, each record once", () => {
    const records = [rec("a", "2026-10-05", -120_000), rec("b", "2026-10-06", -120_000), rec("c", "2026-10-01", -5_000)];
    const { matches, unmatched } = matchStatement([line("2026-10-07", -120_000), line("2026-10-06", -120_000), line("2026-10-20", -5_000)], records, "bank");
    expect(matches.map((m) => m?.recordIds)).toEqual([["a"], ["b"], undefined]);
    // ₺50 on the 20th is too far from the 1st.
    expect(unmatched.map((r) => r.id)).toEqual(["c"]);
  });

  it("never pairs money in with money out, or a day too early", () => {
    const { matches } = matchStatement([line("2026-10-05", 120_000), line("2026-10-01", -120_000)], [rec("a", "2026-10-05", -120_000)], "bank");
    // The bank booked it four days before Peni has it: more than the three allowed.
    expect(matches).toEqual([null, null]);
  });

  it("finds card sales paid in later, less the bank's commission, one day or a weekend together", () => {
    const records = [
      rec("fri", "2026-10-09", 400_000, "sales"),
      rec("sat", "2026-10-10", 600_000, "sales"),
      rec("sun", "2026-10-11", 500_000, "sales"),
      rec("mon", "2026-10-12", 300_000, "sales"),
    ];
    const { matches, unmatched } = matchStatement([line("2026-10-10", 392_800), line("2026-10-13", 1_080_000), line("2026-10-13", 280_000)], records, "bank");
    expect(matches[0]).toMatchObject({ recordIds: ["fri"], kind: "sales", amountKurus: 400_000, feeKurus: 7_200, day: "2026-10-09" });
    expect(matches[1]).toMatchObject({ recordIds: ["sat", "sun"], amountKurus: 1_100_000, feeKurus: 20_000, day: "2026-10-11" });
    // ₺2.800 is ₺200 short of Monday's ₺3.000: more than 5% commission, so it isn't Monday's.
    expect(matches[2]).toBeNull();
    expect(unmatched.map((r) => r.id)).toEqual(["mon"]);
  });

  it("only looks for card sales on a bank account's statement", () => {
    const { matches } = matchStatement([line("2026-10-10", 98_000)], [rec("s", "2026-10-09", 100_000, "sales")], "card");
    expect(matches).toEqual([null]);
  });

  it("counts days across months", () => {
    expect([dayDiff("2026-09-30", "2026-10-01"), dayDiff("2026-10-05", "2026-10-01")]).toEqual([1, -4]);
  });
});

describe("Z report beside the till (plan piece 27)", () => {
  it("sets cash, card and the total beside the till's, and says which are off by more than ₺1", () => {
    const rows = compareZ(
      { totalKurus: 1_000_000, cashKurus: 395_000, cardKurus: 605_050 },
      { cashKurus: 400_000, cardKurus: 605_000, peniKurus: 9_000, askiKurus: 0, payments: 40 },
    );
    expect(rows).toEqual([
      { key: "cash", zKurus: 395_000, tillKurus: 400_000, differenceKurus: -5_000 },
      { key: "card", zKurus: 605_050, tillKurus: 605_000, differenceKurus: 50 },
      { key: "total", zKurus: 1_000_000, tillKurus: 1_005_000, differenceKurus: -5_000 },
    ]);
    expect(rows.map(zDiffers)).toEqual([true, false, true]);
    expect(
      compareZ({ totalKurus: null, cashKurus: null, cardKurus: null }, { cashKurus: 1, cardKurus: 2, peniKurus: 0, askiKurus: 0, payments: 1 }).map(zDiffers),
    ).toEqual([false, false, false]);
  });
});
