import { describe, expect, it } from "vitest";
import {
  dayPay,
  owedByMonth,
  plannedMinutes,
  plusDays,
  rateOn,
  shiftTimesProblem,
  weekDays,
  weekStartOf,
  type PayRate,
  type Shift,
  type WorkDay,
} from "../src";

const at = new Date("2026-10-01T09:00:00Z");
const rate = (memberId: string, fromDay: string, kurusPerHour: number): PayRate => ({
  id: `${memberId}${fromDay}`,
  cafeId: "c",
  memberId,
  fromDay,
  kurusPerHour,
  byId: "x",
  createdAt: at,
});
const day = (memberId: string, d: string, minutes: number): WorkDay => ({ cafeId: "c", memberId, day: d, minutes, note: null, byId: "x", updatedAt: at });

describe("shifts and pay", () => {
  it("finds a day's week, Monday first, across months and years", () => {
    expect(weekStartOf("2026-10-16")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-12")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
    expect(weekDays("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(plusDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("takes shifts on the quarter hour within one day", () => {
    expect(shiftTimesProblem(480, 960)).toBeNull();
    expect(shiftTimesProblem(960, 1440)).toBeNull();
    expect(shiftTimesProblem(485, 960)).toBe("SHIFT_TIMES");
    expect(shiftTimesProblem(960, 960)).toBe("SHIFT_TIMES");
    expect(shiftTimesProblem(1320, 1455)).toBe("SHIFT_TIMES");
    const shift = (d: string, start: number, end: number, memberIds: string[]): Shift => ({
      id: `${d}${start}`,
      cafeId: "c",
      day: d,
      startMinutes: start,
      endMinutes: end,
      memberIds,
      note: null,
      createdById: "x",
      createdAt: at,
      updatedAt: at,
    });
    expect([...plannedMinutes([shift("2026-10-12", 480, 720, ["a", "b"]), shift("2026-10-12", 900, 1080, ["a"])])]).toEqual([
      ["a|2026-10-12", 420],
      ["b|2026-10-12", 240],
    ]);
  });

  it("pays each day at the rate it had then, and keeps what is owed per month", () => {
    const rates = [rate("a", "2026-09-01", 15_000), rate("a", "2026-10-01", 16_500), rate("b", "2026-10-05", 20_000)];
    expect(rateOn(rates, "a", "2026-09-30")).toBe(15_000);
    expect(rateOn(rates, "a", "2026-10-01")).toBe(16_500);
    expect(rateOn(rates, "b", "2026-10-04")).toBeNull();
    expect(dayPay(450, 16_500)).toBe(123_750);
    expect(dayPay(20, 15_000)).toBe(5_000);
    expect(dayPay(480, null)).toBe(0);
    const days = [day("a", "2026-09-30", 480), day("a", "2026-10-01", 480), day("b", "2026-10-04", 480), day("b", "2026-10-05", 60)];
    const paid = { cafeId: "c", method: "bank" as const, account: null, note: null, byId: "x", createdAt: at, paidOn: "2026-10-02" };
    const owed = owedByMonth(days, rates, [
      { ...paid, id: "p1", memberId: "a", month: "2026-09", amountKurus: 120_000 },
      { ...paid, id: "p2", memberId: "a", month: "2026-10", amountKurus: 100_000 },
    ]);
    // a's September is paid; b's day before a rate earns nothing.
    expect([...owed].map(([m, months]) => [m, [...months]])).toEqual([
      ["a", [["2026-10", 32_000]]],
      ["b", [["2026-10", 20_000]]],
    ]);
  });
});
