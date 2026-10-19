import { describe, expect, it } from "vitest";
import {
  billSpikes,
  forecast,
  InMemoryWatchStore,
  orderAmount,
  priceForMargin,
  roundPrice,
  staffingHints,
  twiceBills,
  unusualVoids,
  type StaffingSlot,
} from "../src";

const DAY = 86_400_000;

describe("Price watch (plan piece 31, C12)", () => {
  it("rounds menu prices up as cafés set them", () => {
    expect(roundPrice(12_010)).toBe(12_500);
    expect(roundPrice(12_000)).toBe(12_000);
    expect(roundPrice(4_210)).toBe(4_300);
  });

  it("finds the price that gives a product its margin back", () => {
    // ₺30 of cost at an 80% margin wants ₺150.
    expect(priceForMargin(3_000, 80)).toBe(15_000);
    expect(priceForMargin(3_010, 80)).toBe(15_500);
    expect(priceForMargin(3_000, 100)).toBeNull();
  });
});

describe("Unusual activity (plan piece 31, C13)", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const order = (id: string, voided: [number, string] | null, refunded: [number, string] | null = null) => ({
    id,
    voidedAt: voided ? ago(voided[0]) : null,
    voidedByMemberId: voided?.[1] ?? null,
    refundedAt: refunded ? ago(refunded[0]) : null,
    refundedByMemberId: refunded?.[1] ?? null,
  });

  it("flags a person voiding and refunding more than they usually do", () => {
    const orders = [
      order("a", [1, "ece"]),
      order("b", [2, "ece"]),
      order("c", null, [3, "ece"]),
      order("d", [10, "ece"]),
      // Murat often voids: three this week is his usual.
      ...[1, 2, 3, 9, 10, 11, 16, 17, 18, 23, 24, 25].map((d, i) => order(`m${i}`, [d, "murat"])),
      // Older than five weeks: not counted.
      order("old", [40, "ece"]),
    ];
    expect(unusualVoids(orders, now)).toEqual([{ memberId: "ece", count: 3, usual: 0.3, orderIds: ["a", "b", "c"] }]);
    expect(unusualVoids(orders.slice(0, 2), now)).toEqual([]);
  });

  const bill = (id: string, date: string, totalKurus: number, supplierId: string | null = "sup", voidedAt: Date | null = null) => ({
    id,
    date,
    totalKurus,
    supplierId,
    voidedAt,
  });

  it("flags a bill twice the supplier's usual", () => {
    const bills = [
      bill("1", "2026-09-01", 10_000),
      bill("2", "2026-09-08", 12_000),
      bill("3", "2026-09-15", 11_000),
      bill("4", "2026-10-14", 23_000),
      bill("5", "2026-10-15", 21_000),
    ];
    expect(billSpikes(bills, "2026-10-10")).toEqual([{ billId: "4", usualKurus: 11_000 }]);
    // With fewer than three bills before it there is no usual yet.
    expect(billSpikes(bills.slice(2), "2026-10-10")).toEqual([]);
  });

  it("flags two bills from one supplier for the same amount within days", () => {
    const bills = [
      bill("1", "2026-10-05", 30_000),
      bill("2", "2026-10-12", 30_000),
      bill("3", "2026-10-13", 30_000, "other"),
      bill("4", "2026-10-14", 30_000, "sup", new Date()),
      bill("5", "2026-10-30", 30_000),
    ];
    expect(twiceBills(bills, "2026-10-10")).toEqual([["1", "2"]]);
    expect(twiceBills(bills, "2026-10-13")).toEqual([]);
  });
});

describe("Cash-flow forecast (plan piece 31, C14)", () => {
  it("adds the weekday's sales, takes everyday buying and what's due, and finds the lowest day", () => {
    const f = forecast({
      today: "2026-10-16",
      days: 4,
      startKurus: 10_000,
      // Friday 5 000, Saturday 8 000, Sunday nothing, Monday 2 000.
      salesByWeekday: new Map([
        [5, 5_000],
        [6, 8_000],
        [1, 2_000],
      ]),
      dailySpendKurus: 1_000,
      events: [
        { day: "2026-10-18", kurus: -25_000, kind: "rent", label: "Kira" },
        { day: "2026-10-30", kurus: -99_000, kind: "bill", label: "Too late" },
      ],
    });
    expect(f.days.map((d) => [d.day, d.inKurus, d.outKurus, d.balanceKurus])).toEqual([
      ["2026-10-16", 5_000, 1_000, 14_000],
      ["2026-10-17", 8_000, 1_000, 21_000],
      ["2026-10-18", 0, 26_000, -5_000],
      ["2026-10-19", 2_000, 1_000, -4_000],
    ]);
    expect(f.lowest).toEqual({ day: "2026-10-18", balanceKurus: -5_000 });
  });
});

describe("Order suggestions (plan piece 31, C15)", () => {
  it("orders to last ten days above the low mark, in whole units, when it runs out within a week", () => {
    // 2 L of milk, 1 L low mark, 1.2 L a day: lasts under a day; 12 + 1 − 2 = 11 L.
    expect(orderAmount({ qtyMilli: 2_000, minMilli: 1_000, usedPerDayMilli: 1_200 })).toEqual({ orderMilli: 11_000, daysLeft: 0.8 });
    expect(orderAmount({ qtyMilli: -500, minMilli: 0, usedPerDayMilli: 250 })).toEqual({ orderMilli: 3_000, daysLeft: 0 });
    expect(orderAmount({ qtyMilli: 20_000, minMilli: 0, usedPerDayMilli: 1_000 })).toBeNull();
    expect(orderAmount({ qtyMilli: 0, minMilli: 0, usedPerDayMilli: 0 })).toBeNull();
  });
});

describe("Staffing hints (plan piece 31, C16)", () => {
  it("joins busy, empty and quiet hours into runs against the café's usual load", () => {
    const slot = (weekday: number, hour: number, orders: number, people: number): StaffingSlot => ({ weekday, hour, orders, people });
    const slots = [
      slot(6, 8, 5, 0),
      slot(6, 9, 6, 0),
      slot(6, 10, 18, 1),
      slot(6, 11, 20, 1),
      slot(6, 12, 9, 1),
      slot(6, 13, 2, 3),
      slot(6, 14, 4, 3),
      slot(7, 10, 18, 1),
    ];
    expect(staffingHints(slots, 6)).toEqual([
      { kind: "nobody", weekday: 6, fromHour: 8, toHour: 10, orders: 6, people: 0 },
      { kind: "busy", weekday: 6, fromHour: 10, toHour: 12, orders: 19, people: 1 },
      { kind: "quiet", weekday: 6, fromHour: 14, toHour: 15, orders: 4, people: 3 },
      { kind: "busy", weekday: 7, fromHour: 10, toHour: 11, orders: 18, people: 1 },
    ]);
    // Never "busy" below eight orders an hour for one person, however quiet the café usually is.
    expect(staffingHints([slot(1, 9, 7, 1)], 2)).toEqual([]);
  });
});

describe("What was seen (plan piece 31)", () => {
  it("keeps the first look, per café", async () => {
    const store = new InMemoryWatchStore();
    const at = new Date("2026-10-16T09:00:00Z");
    await store.dismiss({ cafeId: "c", key: "k", memberId: "a", note: null, at });
    await store.dismiss({ cafeId: "c", key: "k", memberId: "b", note: "again", at: new Date(at.getTime() + 1) });
    expect(await store.listDismissed("c")).toEqual([{ cafeId: "c", key: "k", memberId: "a", note: null, at }]);
    expect(await store.listDismissed("d")).toEqual([]);
    await store.undismiss("c", "k");
    expect(await store.listDismissed("c")).toEqual([]);
  });
});
