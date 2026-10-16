import { describe, expect, it } from "vitest";
import { localDateKey, startOfLocalDay, startOfLocalMonth, startOfNextLocalDay } from "../src";

describe("local day boundaries", () => {
  it("uses Istanbul midnight (UTC+3)", () => {
    expect(startOfLocalDay(new Date("2026-10-15T22:30:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-10-15T20:30:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(startOfLocalMonth(new Date("2026-10-15T09:00:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });

  it("finds the end of the local day, also across a DST change", () => {
    expect(startOfNextLocalDay(new Date("2026-10-15T09:00:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-15T21:00:00.000Z");
    // 23:30 local is still "today" until midnight.
    expect(startOfNextLocalDay(new Date("2026-10-15T20:30:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-15T21:00:00.000Z");
    // Berlin falls back on 25 Oct 2026: that local day is 25 hours long.
    expect(startOfNextLocalDay(new Date("2026-10-25T10:00:00Z"), "Europe/Berlin").toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("keys a date by its local calendar day", () => {
    expect(localDateKey(new Date("2026-10-15T20:59:00Z"), "Europe/Istanbul")).toBe("2026-10-15");
    expect(localDateKey(new Date("2026-10-15T21:00:00Z"), "Europe/Istanbul")).toBe("2026-10-16");
  });
});
