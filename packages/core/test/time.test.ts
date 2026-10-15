import { describe, expect, it } from "vitest";
import { startOfLocalDay, startOfLocalMonth } from "../src";

describe("local day boundaries", () => {
  it("uses Istanbul midnight (UTC+3)", () => {
    expect(startOfLocalDay(new Date("2026-10-15T22:30:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-15T21:00:00.000Z");
    expect(startOfLocalDay(new Date("2026-10-15T20:30:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-10-14T21:00:00.000Z");
    expect(startOfLocalMonth(new Date("2026-10-15T09:00:00Z"), "Europe/Istanbul").toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });
});
