import { describe, expect, it } from "vitest";
import { eventTurnout, monthNumbers, ordersAgainstUsual, rate, returnAfter, visitDays, weeklyVisitors, type MemberDay } from "../src";

const v = (membershipId: string, ...days: string[]): MemberDay[] => days.map((day) => ({ membershipId, day }));

describe("Community insights (plan piece 32)", () => {
  const days = visitDays([
    // A regular both months.
    ...v("a", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-10-01", "2026-10-05", "2026-10-08", "2026-10-12"),
    // A regular in September who hasn't come in October.
    ...v("b", "2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"),
    // Came in September, came back once.
    ...v("c", "2026-09-20", "2026-10-14"),
    // New in October; twice the same day is one visit.
    ...v("d", "2026-10-10", "2026-10-10"),
    // New in September, only after the 16th.
    ...v("e", "2026-09-28"),
  ]);

  it("counts this month's visitors, newcomers and regulars against the same days of the month before", () => {
    expect(monthNumbers(days, "2026-10", "2026-10-16")).toEqual({
      visitors: 3,
      visitorsBefore: 2,
      newcomers: 1,
      newcomersBefore: 2,
      regulars: 1,
      regularsBefore: 0,
      cameBack: { people: 4, cameBack: 2, pct: 50 },
      regularsAway: 1,
    });
    // Over the whole of September, a and b were regulars.
    expect(monthNumbers(days, "2026-09", "2026-09-30")).toMatchObject({ visitors: 4, regulars: 2, newcomers: 4 });
  });

  it("splits each week's people into first-timers and those who came before", () => {
    const weeks = weeklyVisitors(days, "2026-10-16", 3);
    expect(weeks).toEqual([
      { week: "2026-09-28", newcomers: 1, returning: 1 },
      { week: "2026-10-05", newcomers: 1, returning: 1 },
      { week: "2026-10-12", newcomers: 0, returning: 2 },
    ]);
  });

  it("compares coming back after spending peni with everyone else, and hides small groups", () => {
    const spent = [...v("a", "2026-09-09"), ...v("c", "2026-09-20"), ...v("x", "2026-09-01")];
    // Only what happened by 20 September counts: everyone has had 30 days to come back since.
    const r = returnAfter(spent, days, "2026-09-01", "2026-10-20");
    // a and c came again within 30 days (c on the 14th, 24 days on); x has no visit after.
    expect(r.with).toEqual({ people: 3, cameBack: 2, pct: 67 });
    // b came back after the 3rd; d and e first came after the 20th, too late to count.
    expect(r.without).toEqual({ people: 1, cameBack: 1, pct: null });
    expect(rate(2, 2).pct).toBeNull();
  });

  it("finds who came to an event, who came back after, and new faces that day", () => {
    expect(eventTurnout("2026-10-10", ["a", "d", "d", "b"], days, "2026-10-16")).toEqual({ going: 3, came: 1, cameBackAfter: 0, newcomers: 1 });
    expect(eventTurnout("2026-10-08", ["a"], days, "2026-10-16")).toEqual({ going: 1, came: 1, cameBackAfter: 1, newcomers: 0 });
  });

  it("sets a day's orders against the same weekday before", () => {
    const orders = new Map([
      ["2026-10-09", 40],
      ["2026-10-02", 50],
      ["2026-10-16", 63],
    ]);
    expect(ordersAgainstUsual("2026-10-16", orders)).toEqual({ orders: 63, usual: 45, liftPct: 40 });
    expect(ordersAgainstUsual("2026-10-17", orders)).toEqual({ orders: 0, usual: null, liftPct: null });
  });
});
