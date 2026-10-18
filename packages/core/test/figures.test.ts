import { describe, expect, it } from "vitest";
import { bucketsOf, daysBetween, previousRange, reportStep, validDay } from "../src";

describe("report periods", () => {
  it("compares one day with the same weekday a week before", () => {
    expect(previousRange("2026-10-18", "2026-10-18")).toEqual({ from: "2026-10-11", through: "2026-10-11" });
    expect(reportStep("2026-10-18", "2026-10-18")).toBe("hour");
    expect(bucketsOf("2026-10-18", "2026-10-18", "hour")).toHaveLength(24);
  });

  it("compares a month so far with the same days of the month before", () => {
    expect(previousRange("2026-10-01", "2026-10-18")).toEqual({ from: "2026-09-01", through: "2026-09-18" });
    expect(previousRange("2026-03-01", "2026-03-31")).toEqual({ from: "2026-02-01", through: "2026-02-28" });
    expect(previousRange("2026-01-01", "2026-01-10")).toEqual({ from: "2025-12-01", through: "2025-12-10" });
  });

  it("compares other periods with as many days just before", () => {
    expect(previousRange("2026-10-12", "2026-10-18")).toEqual({ from: "2026-10-05", through: "2026-10-11" });
    expect(daysBetween("2026-07-20", "2026-10-18")).toBe(91);
    expect(reportStep("2026-07-20", "2026-10-18")).toBe("week");
    expect(reportStep("2025-10-19", "2026-10-18")).toBe("month");
  });

  it("buckets days, Monday weeks and months", () => {
    expect(bucketsOf("2026-10-14", "2026-10-16", "day")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(bucketsOf("2026-10-01", "2026-10-18", "week")).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(bucketsOf("2026-08-15", "2026-10-18", "month")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(validDay("2026-02-30")).toBe(false);
    expect(validDay("2026-02-28")).toBe(true);
  });
});
