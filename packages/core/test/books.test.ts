import { describe, expect, it } from "vitest";
import { addMonths, closedThrough, InMemoryBooksStore, monthDays, nextMonthToClose, validMonth, type MonthClose } from "../src";

const close = (month: string, reopened = false): MonthClose => ({
  id: `mcl_${month}_${reopened}`,
  cafeId: "c",
  month,
  closedAt: new Date(`${month}-28T00:00:00Z`),
  closedById: "m",
  note: null,
  summary: {} as MonthClose["summary"],
  reopenedAt: reopened ? new Date() : null,
  reopenedById: null,
  reopenReason: null,
});

describe("months (plan piece 20)", () => {
  it("counts months across years and knows their last day", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthDays("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthDays("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect([validMonth("2026-13"), validMonth("2026-1"), validMonth("2026-10")]).toEqual([false, false, true]);
  });

  it("closes months in order, only once they are over; a reopened close doesn't count", () => {
    expect(nextMonthToClose([], "2026-10-16")).toBe("2026-09");
    expect(nextMonthToClose([close("2026-09")], "2026-10-16")).toBeNull();
    expect(nextMonthToClose([close("2026-08")], "2026-10-16")).toBe("2026-09");
    expect(nextMonthToClose([close("2026-09", true), close("2026-08")], "2026-10-16")).toBe("2026-09");
    expect(closedThrough([close("2026-09", true), close("2026-08")])).toBe("2026-08-31");
    expect(closedThrough([])).toBeNull();
  });

  it("keeps one movement per source and account, and one standing close per month", async () => {
    const store = new InMemoryBooksStore();
    const m = {
      id: "a",
      cafeId: "c",
      account: "bank" as const,
      amountKurus: 100,
      kind: "deposit" as const,
      counterpart: null,
      source: "manual:1",
      day: "2026-10-01",
      note: null,
      memberId: "m",
      createdAt: new Date(),
    };
    await store.addMovements([m, { ...m, id: "b" }, { ...m, id: "c", account: "reserve", amountKurus: -40, day: "2026-10-03" }]);
    expect(await store.totals("c")).toEqual({ reserve: -40, bank: 100 });
    expect(await store.totals("c", "2026-10-02")).toEqual({ reserve: 0, bank: 100 });
    await store.removeBySource("c", "manual:1");
    expect(await store.listMovements("c")).toEqual([]);
    expect(await store.saveClose(close("2026-09"))).toBe(true);
    expect(await store.saveClose({ ...close("2026-09"), id: "other" })).toBe(false);
    expect(await store.saveClose({ ...close("2026-09"), reopenedAt: new Date() })).toBe(true);
    expect(await store.saveClose({ ...close("2026-09"), id: "other" })).toBe(true);
  });
});
