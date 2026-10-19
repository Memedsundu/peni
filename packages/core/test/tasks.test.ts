import { describe, expect, it } from "vitest";
import { dueOn, InMemoryTaskStore, shiftEnds, weekdayOf, type TaskItem } from "../src";

const item = (over: Partial<TaskItem> = {}): TaskItem => ({
  id: "i",
  cafeId: "c",
  listId: "l",
  title: "Makineyi aç",
  note: null,
  days: [1, 2, 3, 4, 5],
  sortOrder: 0,
  fromDay: "2026-10-12",
  untilDay: null,
  ...over,
});

describe("tasks", () => {
  it("knows the weekday, Monday first", () => {
    expect(weekdayOf("2026-10-12")).toBe(1);
    expect(weekdayOf("2026-10-18")).toBe(7);
  });

  it("is due on its days while it is on the list", () => {
    expect(dueOn(item(), "2026-10-16")).toBe(true);
    expect(dueOn(item(), "2026-10-17")).toBe(false); // Saturday
    expect(dueOn(item(), "2026-10-09")).toBe(false); // before it was added
    expect(dueOn(item({ untilDay: "2026-10-15" }), "2026-10-14")).toBe(true);
    expect(dueOn(item({ untilDay: "2026-10-15" }), "2026-10-15")).toBe(false);
  });

  it("finds the people on the first and last shifts", () => {
    const ends = shiftEnds([
      { startMinutes: 480, endMinutes: 960, memberIds: ["ece"] },
      { startMinutes: 540, endMinutes: 1020, memberIds: ["hakan"] },
      { startMinutes: 720, endMinutes: 1200, memberIds: ["murat", "ece"] },
    ]);
    expect(ends).toEqual({ first: ["ece"], last: ["murat", "ece"] });
    expect(shiftEnds([])).toEqual({ first: [], last: [] });
  });

  it("records the morning email once a day", async () => {
    const store = new InMemoryTaskStore();
    const d = { cafeId: "c", day: "2026-10-16", sentAt: new Date(), recipients: 2 };
    expect(await store.addDigest(d)).toBe(true);
    expect(await store.addDigest(d)).toBe(false);
    await store.setMuted("c", "m1", true);
    expect(await store.listMuted("c")).toEqual(["m1"]);
    await store.setMuted("c", "m1", false);
    expect(await store.listMuted("c")).toEqual([]);
  });
});
