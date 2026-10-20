import { describe, expect, it } from "vitest";
import {
  billSpikes,
  cashGapLimit,
  forecast,
  InMemoryWatchStore,
  judge,
  learnedOrder,
  letGoCounts,
  median,
  orderAmount,
  orderHabits,
  percentile,
  priceForMargin,
  roundPrice,
  spikeLimit,
  staffingBars,
  staffingHints,
  swing,
  twiceBills,
  unusualVoids,
  voidsLimit,
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
    expect(unusualVoids(orders, now)).toEqual([{ memberId: "ece", count: 3, usual: 0.3, limit: 3, letGo: 0, quiet: false, orderIds: ["a", "b", "c"] }]);
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
    expect(billSpikes(bills, "2026-10-10")).toEqual([{ billId: "4", supplierId: "sup", usualKurus: 11_000, limitKurus: 22_000, letGo: 0, quiet: false }]);
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
    expect(twiceBills(bills, "2026-10-10")).toEqual([{ billIds: ["1", "2"], supplierId: "sup", letGo: 0, quiet: false }]);
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
    expect(staffingHints(slots, staffingBars([], 6))).toEqual([
      { kind: "nobody", weekday: 6, fromHour: 8, toHour: 10, orders: 6, people: 0 },
      { kind: "busy", weekday: 6, fromHour: 10, toHour: 12, orders: 19, people: 1 },
      { kind: "quiet", weekday: 6, fromHour: 14, toHour: 15, orders: 4, people: 3 },
      { kind: "busy", weekday: 7, fromHour: 10, toHour: 11, orders: 18, people: 1 },
    ]);
    // Never "busy" below eight orders an hour for one person, however quiet the café usually is.
    expect(staffingHints([slot(1, 9, 7, 1)], staffingBars([], 2))).toEqual([]);
  });
});

describe("What was seen (plan piece 31)", () => {
  it("keeps the first look, per café", async () => {
    const store = new InMemoryWatchStore();
    const at = new Date("2026-10-16T09:00:00Z");
    await store.dismiss({ cafeId: "c", key: "k", kind: "billSpike", subject: "sup", memberId: "a", note: null, at });
    await store.dismiss({ cafeId: "c", key: "k", kind: "billSpike", subject: "sup", memberId: "b", note: "again", at: new Date(at.getTime() + 1) });
    expect(await store.listDismissed("c")).toEqual([{ cafeId: "c", key: "k", kind: "billSpike", subject: "sup", memberId: "a", note: null, at }]);
    expect(await store.listDismissed("d")).toEqual([]);
    await store.undismiss("c", "k");
    expect(await store.listDismissed("c")).toEqual([]);
  });
});

describe("Suggestions as shown (plan piece 31, C15)", () => {
  it("keeps the day's latest per item, per café", async () => {
    const store = new InMemoryWatchStore();
    await store.noteSuggestions("c", "2026-10-15", [{ itemId: "sut", orderMilli: 11_000 }]);
    await store.noteSuggestions("c", "2026-10-16", [{ itemId: "sut", orderMilli: 11_000 }]);
    await store.noteSuggestions("c", "2026-10-16", [{ itemId: "sut", orderMilli: 13_000 }]);
    await store.noteSuggestions("d", "2026-10-16", [{ itemId: "sut", orderMilli: 1_000 }]);
    expect(await store.listSuggestions("c", "2026-10-16")).toEqual([{ cafeId: "c", itemId: "sut", day: "2026-10-16", orderMilli: 13_000 }]);
    expect(await store.listSuggestions("c", "2026-10-01")).toHaveLength(2);
  });
});

/*
 * Each café judged by its own numbers. A "quiet" café is steady: the same milk bill every
 * time, drawer counts within a few lira, staff who rarely void. A "busy" café swings: bills
 * that vary a lot, drawers off by tens of lira, people whose voids go up and down. The same
 * number can be out of the ordinary in the first and nothing special in the second.
 */
describe("Judged by the café's own numbers (plan piece 31, N3)", () => {
  it("knows the usual, the swing and the nine-in-ten", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    // 1, 3 and 5 are 2, 0 and 2 away from 3: the typical one is 2 away.
    expect(swing([1, 3, 5])).toBe(2);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1)).toBe(1);
  });

  const bill = (id: string, date: string, totalKurus: number, supplierId = "sup") => ({ id, date, totalKurus, supplierId, voidedAt: null });
  const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);

  it("bills: a steady supplier's bill stands out sooner, a swinging one's later", () => {
    // Quiet café: milk at ₺774, eight times. Half as much again is out of the ordinary: ₺1.161.
    const steady = days(8).map((d, i) => bill(`m${i}`, d, 77_400));
    expect(spikeLimit(steady.map((b) => b.totalKurus))).toEqual({ usualKurus: 77_400, limitKurus: 116_100 });
    // A ₺1.200 milk bill: a spike now. With twice the usual it needed ₺1.548.
    expect(billSpikes([...steady, bill("x", "2026-10-14", 120_000)], "2026-10-10").map((s) => s.billId)).toEqual(["x"]);
    expect(billSpikes([...steady, bill("x", "2026-10-14", 110_000)], "2026-10-10")).toEqual([]);

    // Busy café: a supplier whose bills run from ₺500 to ₺2.000. Usual ₺900, a typical bill
    // ₺350 away from it, so up to ₺1.950 is ordinary here.
    const swinging = [50_000, 150_000, 80_000, 200_000, 60_000, 180_000, 100_000, 70_000].map((k, i) => bill(`s${i}`, days(8)[i]!, k));
    expect(spikeLimit(swinging.map((b) => b.totalKurus))).toEqual({ usualKurus: 90_000, limitKurus: 195_000 });
    // ₺1.900 is more than twice ₺900, a spike by the old rule, but not here.
    expect(billSpikes([...swinging, bill("y", "2026-10-14", 190_000)], "2026-10-10")).toEqual([]);
    expect(billSpikes([...swinging, bill("y", "2026-10-14", 200_000)], "2026-10-10").map((s) => s.billId)).toEqual(["y"]);

    // Little history: three to five bills keep the old twice-the-usual.
    expect(spikeLimit([77_400, 77_400, 77_400])).toEqual({ usualKurus: 77_400, limitKurus: 154_800 });
    expect(spikeLimit([77_400, 77_400])).toBeNull();
  });

  it("drawers: a careful café's ₺30 gap is worth a look, a loose one's ₺60 isn't", () => {
    // Quiet café: counts within ₺5 of what's expected. The floor, ₺20, is its bar.
    const careful = [0, -200, 300, 0, -100, 500, 0, 200, -300, 100];
    expect(cashGapLimit(careful)).toBe(2_000);
    // Busy café: off by ₺10 to ₺70. Usually ₺30 off, a typical night ₺12,50 from that: ₺67,50,
    // so a ₺60 gap, worth a look by the old ₺50 rule, is an ordinary night here.
    const loose = [-3_000, 1_000, -6_000, 4_000, -2_000, 7_000, -3_000, 5_000, -1_500, 2_500];
    expect(cashGapLimit(loose)).toBe(6_750);
    // Fewer than ten earlier counts: ₺50, as before.
    expect(cashGapLimit(careful.slice(0, 9))).toBe(5_000);
  });

  it("voids: against each person's own weeks", () => {
    // Quiet café: a barista who voids once a week. Three is out of the ordinary, as before.
    expect(voidsLimit([1, 1, 1, 1])).toBe(3);
    // Twice their usual still counts for someone steady.
    expect(voidsLimit([3, 3, 3, 3])).toBe(6);
    // Busy café: weeks of 0, 6, 1 and 5. Usual 3, a week typically 2,5 away: 10,5.
    expect(voidsLimit([0, 6, 1, 5])).toBe(10.5);

    const now = new Date("2026-10-16T12:00:00Z");
    const ago = (d: number) => new Date(now.getTime() - d * DAY);
    const v = (id: string, d: number, who: string) => ({ id, voidedAt: ago(d), voidedByMemberId: who, refundedAt: null, refundedByMemberId: null });
    // Busy café's barista: six this week. Twice their usual, but their weeks swing that much.
    const swingy = [
      ...[1, 2, 3, 4, 5, 6].map((d, i) => v(`n${i}`, d, "can")),
      ...[8, 8, 9, 9, 10, 10].map((d, i) => v(`w1${i}`, d, "can")),
      v("w2", 15, "can"),
      ...[22, 22, 23, 23, 24].map((d, i) => v(`w3${i}`, d, "can")),
    ];
    expect(unusualVoids(swingy, now)).toEqual([]);
    // Quiet café's barista: one a week, then four.
    const steady = [...[1, 2, 3, 4].map((d, i) => v(`n${i}`, d, "ece")), ...[8, 15, 22, 29].map((d, i) => v(`w${i}`, d, "ece"))];
    expect(unusualVoids(steady, now)).toEqual([expect.objectContaining({ memberId: "ece", count: 4, usual: 1, limit: 3 })]);
  });

  it("staffing: busy and quiet are this café's own nine-in-ten", () => {
    // A new café with no shifts to go by: 1,6× and 0,4× its usual, busy never under 8.
    expect(staffingBars([], 6)).toEqual({ busyAt: 9.6, quietAt: 2.4 });
    expect(staffingBars([], 3)).toEqual({ busyAt: 8, quietAt: 1.2 });

    // Quiet café: usually 4 an hour for one person, hours from 2 to 6.
    const quiet = Array.from({ length: 30 }, (_, i) => 2 + (i % 5));
    expect(staffingBars(quiet, 4)).toEqual({ busyAt: 8, quietAt: 2 });
    // Busy café: usually 10, hours from 4 to 22. Busy is past 9 in 10 of its hours (20), quiet under 1 in 10 (5).
    const busy = Array.from({ length: 30 }, (_, i) => 4 + ((i * 7) % 19));
    expect(staffingBars(busy, 10)).toEqual({ busyAt: 20, quietAt: 5 });
    const slot = (hour: number, orders: number, people: number): StaffingSlot => ({ weekday: 6, hour, orders, people });
    // 18 an hour for one person: busy by the old 1,6×, ordinary in this café.
    expect(staffingHints([slot(10, 18, 1)], staffingBars(busy, 10))).toEqual([]);
    expect(staffingHints([slot(10, 18, 1)], staffingBars([], 10))).toEqual([expect.objectContaining({ kind: "busy" })]);
    expect(staffingHints([slot(10, 21, 1), slot(15, 9, 2)], staffingBars(busy, 10)).map((h) => h.kind)).toEqual(["busy", "quiet"]);
  });
});

describe("Learning from Gördüm (plan piece 31, N3)", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const seen = (kind: "billSpike" | "billTwice" | "voids" | "cashGap" | "price", subject: string | null, daysAgo: number) => ({ kind, subject, at: new Date(now.getTime() - daysAgo * DAY) });

  it("counts what was let go in the last 90 days, per kind and per supplier, person or item", () => {
    const of = letGoCounts([seen("billSpike", "sut", 5), seen("billSpike", "sut", 40), seen("billSpike", "sut", 89), seen("billSpike", "sut", 120), seen("billSpike", "kahve", 3), seen("voids", "sut", 3)], now);
    expect(of("billSpike", "sut")).toBe(3);
    expect(of("billSpike", "kahve")).toBe(1);
    expect(of("voids", "sut")).toBe(1);
    expect(of("cashGap", null)).toBe(0);
  });

  it("raises the bar twofold after three, and says so", () => {
    expect(judge(120, 100, 2)).toEqual({ show: true, quiet: false, limit: 100, letGo: 0 });
    expect(judge(120, 100, 3)).toEqual({ show: false, quiet: true, limit: 200, letGo: 3 });
    expect(judge(210, 100, 4)).toEqual({ show: true, quiet: false, limit: 200, letGo: 4 });
    expect(judge(90, 100, 4)).toEqual({ show: false, quiet: false, limit: 200, letGo: 4 });
  });

  it("shows a supplier's spikes and same-amount bills less once they keep being let go", () => {
    const bill = (id: string, date: string, totalKurus: number, supplierId = "sup") => ({ id, date, totalKurus, supplierId, voidedAt: null });
    const bills = [bill("1", "2026-09-01", 10_000), bill("2", "2026-09-08", 10_000), bill("3", "2026-09-15", 10_000), bill("4", "2026-10-14", 25_000)];
    expect(billSpikes(bills, "2026-10-10", () => 3)).toEqual([{ billId: "4", supplierId: "sup", usualKurus: 10_000, limitKurus: 40_000, letGo: 3, quiet: true }]);
    expect(billSpikes(bills, "2026-10-10", () => 3).filter((s) => !s.quiet)).toEqual([]);

    // The baker brings the same ₺300 of simit a week apart; after three "Gördüm"s only bills
    // five days apart or less are shown.
    const simit = [bill("a", "2026-10-06", 30_000, "firin"), bill("b", "2026-10-13", 30_000, "firin"), bill("c", "2026-10-15", 30_000, "firin")];
    expect(twiceBills(simit, "2026-10-10").map((t) => t.quiet)).toEqual([false, false, false]);
    expect(twiceBills(simit, "2026-10-10", () => 3).map((t) => [t.billIds.join("+"), t.quiet, t.letGo])).toEqual([
      ["a+b", true, 3],
      ["a+c", true, 3],
      ["b+c", false, 3],
    ]);
  });
});

describe("Ordering as the café does (plan piece 31, C15)", () => {
  const today = "2026-10-16";
  const s = (day: string, orderMilli: number, itemId = "sut") => ({ itemId, day, orderMilli });
  const b = (date: string, qtyMilli: number, itemId = "sut") => ({ itemId, date, qtyMilli });

  it("learns that a busy café orders more milk than suggested", () => {
    // Penny said 11 L three times; each time an 18 L bill followed within days.
    const suggested = [s("2026-09-20", 11_000), s("2026-09-22", 11_000), s("2026-10-01", 11_000), s("2026-10-08", 10_000), s("2026-10-09", 11_000)];
    const bought = [b("2026-09-23", 18_000), b("2026-10-02", 18_000), b("2026-10-10", 18_000)];
    const habits = orderHabits(suggested, bought, today);
    // The latest suggestion before each bill: 11, 11 and 11 L, answered with 18 each time.
    expect(habits.get("sut")).toEqual({ times: 3, ratio: 1.64 });
    // 11 L as this café takes it: 18 L.
    expect(learnedOrder(11_000, habits.get("sut"))).toBe(18_000);
    expect(learnedOrder(11_000, undefined)).toBe(11_000);
  });

  it("learns that a quiet café orders less, within limits, and leaves alone what is close enough", () => {
    const suggested = [s("2026-09-20", 10_000), s("2026-10-01", 10_000), s("2026-10-08", 10_000)];
    expect(orderHabits(suggested, [b("2026-09-21", 4_000), b("2026-10-02", 3_000), b("2026-10-09", 4_000)], today).get("sut")).toEqual({ times: 3, ratio: 0.5 });
    // 11, 9 and 12 L for 10 suggested: close enough, nothing learned.
    expect(orderHabits(suggested, [b("2026-09-21", 11_000), b("2026-10-02", 9_000), b("2026-10-09", 12_000)], today).size).toBe(0);
    // Two answers aren't a habit; a bill with no suggestion in the week before answers nothing.
    expect(orderHabits(suggested.slice(1), [b("2026-09-21", 20_000), b("2026-10-02", 20_000), b("2026-10-09", 20_000)], today).size).toBe(0);
    // Older than 90 days is forgotten.
    expect(orderHabits(suggested.map((x) => ({ ...x, day: x.day.replace("2026", "2025") })), [b("2025-09-21", 4_000), b("2025-10-02", 3_000), b("2025-10-09", 4_000)], today).size).toBe(0);
  });
});
