import { beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage } from "./customer-auth";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let sent: EmailMessage[];
let leyla: StaffContext;
let murat: StaffContext;
let hakan: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const h = (hh: number, mm = 0) => hh * 60 + mm;

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  sent = [];
  app = new PeniApp(
    { demo: true, bcryptRounds: 4, clock: () => now, publicUrl: "https://peni.test/", auth: { email: { send: async (m) => void sent.push(m) } } },
    inMemoryStores(),
  );
  await seed(app);
  [leyla, murat, hakan, ece] = await Promise.all([at("leyla"), at("murat"), at("hakan"), at("ece")]);
});

describe("Vardiyalar (plan piece 21)", () => {
  it("shows a published week to everyone, and a draft only to those who plan", async () => {
    const week = await app.shifts.week(ece);
    expect(week).toMatchObject({
      weekStart: "2026-10-12",
      today: "2026-10-16",
      published: true,
      publishedBy: "Murat Aksu",
      visible: true,
      canEdit: false,
      team: [],
    });
    expect(week.days).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(week.shifts.filter((s) => s.mine).map((s) => [s.day, s.start, s.end])).toEqual([
      ["2026-10-12", h(8), h(16)],
      ["2026-10-13", h(8), h(16)],
      ["2026-10-15", h(8), h(16)],
      ["2026-10-16", h(8), h(16)],
      ["2026-10-17", h(9), h(18)],
    ]);
    expect(week.shifts.find((s) => s.day === "2026-10-17")).toMatchObject({
      note: "Hafta sonu kahvaltısı",
      people: [{ name: "Ece Tan" }, { name: "Hakan Usta" }],
    });
    expect(week.totals.map((t) => [t.name, t.minutes])).toEqual([
      ["Murat Aksu", 48 * 60],
      ["Ece Tan", 41 * 60],
      ["Hakan Usta", 41 * 60],
    ]);

    // Next week is a draft: Ece doesn't see it yet; Murat and Hakan plan it.
    expect(await app.shifts.week(ece, "2026-10-19")).toMatchObject({ visible: false, published: false, shifts: [] });
    const draft = await app.shifts.week(hakan, "2026-10-19");
    expect(draft).toMatchObject({ visible: true, published: false, canEdit: true, canCopy: false });
    expect(draft.shifts).toHaveLength(15);
    // Everyone on the team can be put on a shift, owner and manager too.
    expect(draft.team.map((p) => p.name)).toEqual(["Leyla Kara", "Murat Aksu", "Hakan Usta", "Ece Tan"]);
    expect(await code(app.shifts.week(ece, "2026-10-20"))).toBe("WEEK_INVALID");
  });

  it("adds, moves and removes shifts, never two at once for the same person", async () => {
    const people = (await app.shifts.week(murat)).team;
    const id = (name: string) => people.find((p) => p.name === name)!.memberId;
    const k = key();
    let week = await app.shifts.add(murat, {
      key: k,
      day: "2026-10-22",
      start: h(16),
      end: h(24),
      memberIds: [id("Ece Tan"), id("Leyla Kara")],
      note: "Konser gecesi",
    });
    expect(week.weekStart).toBe("2026-10-19");
    const added = week.shifts.find((s) => s.note === "Konser gecesi")!;
    expect(added).toMatchObject({ day: "2026-10-22", start: h(16), end: h(24), people: [{ name: "Ece Tan" }, { name: "Leyla Kara" }] });
    // The same key adds it once.
    week = await app.shifts.add(murat, { key: k, day: "2026-10-22", start: h(16), end: h(24), memberIds: [id("Ece Tan")] });
    expect(week.shifts.filter((s) => s.note === "Konser gecesi")).toHaveLength(1);

    // Ece already works 08:00–16:00 that Thursday: 15:00 overlaps, 16:00 doesn't.
    expect(await code(app.shifts.add(murat, { key: key(), day: "2026-10-22", start: h(15), end: h(17), memberIds: [id("Ece Tan")] }))).toBe("SHIFT_OVERLAP");
    expect(await code(app.shifts.add(murat, { key: key(), day: "2026-10-22", start: h(9, 10), end: h(12), memberIds: [id("Hakan Usta")] }))).toBe(
      "SHIFT_TIMES",
    );
    expect(await code(app.shifts.add(murat, { key: key(), day: "2026-10-22", start: h(12), end: h(12), memberIds: [id("Hakan Usta")] }))).toBe("SHIFT_TIMES");
    expect(await code(app.shifts.add(murat, { key: key(), day: "2026-10-22", start: h(18), end: h(20), memberIds: ["sm_nobody"] }))).toBe("NOT_ON_TEAM");
    expect(await code(app.shifts.add(ece, { key: key(), day: "2026-10-22", start: h(18), end: h(20), memberIds: [id("Ece Tan")] }))).toBe("FORBIDDEN");

    // Moved to Friday, where Ece's 08:00–16:00 ends as it starts.
    week = await app.shifts.update(hakan, added.id, { day: "2026-10-23", memberIds: [id("Ece Tan")] });
    expect(week.shifts.find((s) => s.id === added.id)).toMatchObject({ day: "2026-10-23", people: [{ name: "Ece Tan" }], note: "Konser gecesi" });
    expect(await code(app.shifts.update(hakan, added.id, { start: h(15) }))).toBe("SHIFT_OVERLAP");
    week = await app.shifts.remove(hakan, added.id);
    expect(week.shifts.some((s) => s.id === added.id)).toBe(false);
    expect(await code(app.shifts.remove(hakan, added.id))).toBe("SHIFT_NOT_FOUND");
  });

  it("copies last week into an empty week, and publishes it with an email to each person on it", async () => {
    expect(await code(app.shifts.copy(murat, { week: "2026-10-19" }))).toBe("WEEK_NOT_EMPTY");
    expect((await app.shifts.week(murat, "2026-10-26")).canCopy).toBe(true);
    let week = await app.shifts.copy(murat, { week: "2026-10-26" });
    expect(week.shifts).toHaveLength(15);
    expect(week.shifts[0]).toMatchObject({ day: "2026-10-26", start: h(8), people: [{ name: "Ece Tan" }] });
    expect(week).toMatchObject({ published: false, canCopy: false });
    expect(await code(app.shifts.copy(murat, { week: "2026-11-09" }))).toBe("NOTHING_TO_COPY");

    week = await app.shifts.publish(murat, { week: "2026-10-26", published: true });
    expect(week).toMatchObject({ published: true, publishedBy: "Murat Aksu" });
    expect((await app.shifts.week(ece, "2026-10-26")).shifts.filter((s) => s.mine)).toHaveLength(5);
    expect(sent.map((m) => [m.to, m.subject])).toEqual([
      ["ece@moda.test", "Vardiyaların · Moda Kahvesi"],
      ["murat@moda.test", "Vardiyaların · Moda Kahvesi"],
      ["hakan@moda.test", "Vardiyaların · Moda Kahvesi"],
    ]);
    const ece$ = sent[0]!;
    expect(ece$.text).toContain("Ece, bu haftaki vardiyaların");
    expect(ece$.text).toContain("Pazartesi 26 Ekim · 08:00–16:00");
    expect(ece$.text).toContain("Cumartesi 31 Ekim · 09:00–18:00 · Hafta sonu kahvaltısı");
    expect(ece$.text).toContain("https://peni.test/panel/vardiyalar?kafe=moda&hafta=2026-10-26");

    // Published again: no second email. Back to a draft: Ece no longer sees it.
    await app.shifts.publish(murat, { week: "2026-10-26", published: true });
    expect(sent).toHaveLength(3);
    await app.shifts.publish(murat, { week: "2026-10-26", published: false });
    expect(await app.shifts.week(ece, "2026-10-26")).toMatchObject({ visible: false, shifts: [] });
    expect(await code(app.shifts.publish(ece, { week: "2026-10-26", published: true }))).toBe("FORBIDDEN");
  });

  it("keeps the shifts of a closed month as they were", async () => {
    await app.money.closeMonth(leyla, { month: "2026-09" });
    const sept = await app.shifts.week(murat, "2026-09-28");
    expect(sept.closedThrough).toBe("2026-09-30");
    const tuesday = sept.shifts.find((s) => s.day === "2026-09-29")!;
    expect(await code(app.shifts.remove(murat, tuesday.id))).toBe("PERIOD_CLOSED");
    expect(await code(app.shifts.update(murat, tuesday.id, { day: "2026-10-01" }))).toBe("PERIOD_CLOSED");
    // A shift moved into the closed month is refused too.
    const thursday = sept.shifts.find((s) => s.day === "2026-10-01")!;
    expect(await code(app.shifts.update(murat, thursday.id, { day: "2026-09-30" }))).toBe("PERIOD_CLOSED");
    expect(await code(app.shifts.update(murat, thursday.id, { end: h(17) }))).toBe("ok");
  });
});

describe("Puantaj ve maaş (plan piece 21)", () => {
  it("shows each person's hours, rate and pay for the month, and what is still to be entered", async () => {
    const view = await app.pay.month(murat);
    expect(view).toMatchObject({
      month: "2026-10",
      today: "2026-10-16",
      months: ["2026-10", "2026-09"],
      own: false,
      canEditHours: true,
      canPay: true,
      closeBlock: "NOT_OVER",
    });
    expect(view.days).toHaveLength(31);
    // The owner isn't paid by the hour; she shows only once she has hours or pay.
    expect(view.people.map((p) => [p.name, p.minutes / 60, p.rateKurus, p.earnedKurus, p.missingDays])).toEqual([
      ["Murat Aksu", 80, 22_000, 1_760_000, 3],
      ["Hakan Usta", 66, 20_000, 1_320_000, 3],
      // Ece's raise from the 1st: ₺165 an hour.
      ["Ece Tan", 74, 16_500, 1_221_000, 2],
    ]);
    const ece$ = view.people[2]!;
    expect(ece$.worked.slice(11, 16)).toEqual([h(8), null, null, null, null]);
    expect(ece$.planned.slice(11, 16)).toEqual([h(8), h(8), 0, h(8), h(8)]);
    expect(ece$.rates.map((r) => [r.fromDay, r.kurusPerHour])).toEqual([
      ["2026-06-18", 15_000],
      ["2026-10-01", 16_500],
    ]);
    expect(view.totals).toEqual({ minutes: 220 * 60, earnedKurus: 4_301_000, paidKurus: 0, leftKurus: 4_301_000, missingDays: 8 });

    // September: paid on the 2nd, except ₺5.000 of Hakan's.
    const sept = await app.pay.month(murat, "2026-09");
    expect(sept.people.map((p) => [p.name, p.earnedKurus, p.paidKurus, p.leftKurus])).toEqual([
      ["Murat Aksu", 4_576_000, 4_576_000, 0],
      ["Hakan Usta", 3_640_000, 3_140_000, 500_000],
      ["Ece Tan", 2_460_000, 2_460_000, 0],
    ]);
    expect(sept.people[1]!.payouts).toMatchObject([
      { amountKurus: 3_140_000, method: "bank", account: "bank", paidOn: "2026-10-02", by: "Leyla Kara", canRemove: true },
    ]);
    expect(sept).toMatchObject({ canClose: true, closeBlock: null });

    // Ece sees only her own, with her own rate.
    const own = await app.pay.month(ece);
    expect(own).toMatchObject({ own: true, canEditHours: false, canPay: false, cashFrom: null, closeBlock: "NO_PERMISSION" });
    expect(own.people.map((p) => [p.name, p.earnedKurus, p.rates.length])).toEqual([["Ece Tan", 1_221_000, 2]]);
    expect(await code(app.pay.month(ece, "2026-11"))).toBe("PAY_MONTH_INVALID");
  });

  it("takes hours by the day, cleared with null, never ahead of today", async () => {
    const { people } = await app.pay.month(murat);
    const [m, hk, e] = people.map((p) => p.memberId) as [string, string, string];
    let view = await app.pay.setHours(murat, "2026-10", {
      days: [
        { memberId: e, day: "2026-10-13", minutes: h(8) },
        { memberId: e, day: "2026-10-15", minutes: h(6, 30) },
        { memberId: hk, day: "2026-10-13", minutes: h(8) },
        { memberId: hk, day: "2026-10-14", minutes: h(8) },
        { memberId: hk, day: "2026-10-15", minutes: h(8) },
        { memberId: m, day: "2026-10-13", minutes: h(8) },
        { memberId: m, day: "2026-10-14", minutes: h(8) },
        { memberId: m, day: "2026-10-15", minutes: 0 },
      ],
    });
    expect(view.totals.missingDays).toBe(0);
    expect(view.people[2]).toMatchObject({ minutes: h(88, 30), earnedKurus: 1_221_000 + 132_000 + 107_250 });
    view = await app.pay.setHours(murat, "2026-10", { days: [{ memberId: m, day: "2026-10-15", minutes: null }] });
    expect(view.people[0]!.missingDays).toBe(1);

    expect(await code(app.pay.setHours(murat, "2026-10", { days: [{ memberId: e, day: "2026-10-17", minutes: h(8) }] }))).toBe("HOURS_FUTURE");
    expect(await code(app.pay.setHours(murat, "2026-10", { days: [{ memberId: e, day: "2026-10-14", minutes: 1441 }] }))).toBe("HOURS_INVALID");
    expect(await code(app.pay.setHours(murat, "2026-10", { days: [{ memberId: "sm_nobody", day: "2026-10-14", minutes: 60 }] }))).toBe("NOT_ON_TEAM");
    expect(await code(app.pay.setHours(ece, "2026-10", { days: [{ memberId: e, day: "2026-10-14", minutes: h(8) }] }))).toBe("FORBIDDEN");
  });

  it("pays from an hourly rate that starts on a day, until the next one", async () => {
    const { people } = await app.pay.month(murat);
    const hk = people[1]!.memberId;
    // From the 7th Hakan gets ₺210: 33 hours entered since then (₺330 more).
    let view = await app.pay.setRate(murat, "2026-10", { memberId: hk, kurusPerHour: 21_000, fromDay: "2026-10-07" });
    expect(view.people[1]).toMatchObject({ rateKurus: 21_000, earnedKurus: 1_320_000 + 33 * 1_000 });
    // The same day again replaces it.
    view = await app.pay.setRate(murat, "2026-10", { memberId: hk, kurusPerHour: 20_500, fromDay: "2026-10-07" });
    expect(view.people[1]!.rates.map((r) => r.kurusPerHour)).toEqual([20_000, 20_500]);
    view = await app.pay.removeRate(murat, "2026-10", view.people[1]!.rates[1]!.id);
    expect(view.people[1]).toMatchObject({ rateKurus: 20_000, earnedKurus: 1_320_000 });
    expect(await code(app.pay.setRate(ece, "2026-10", { memberId: hk, kurusPerHour: 1, fromDay: "2026-10-07" }))).toBe("FORBIDDEN");
  });

  it("pays what is left of a month from the bank or the cash, and takes it back with its money", async () => {
    const sept = await app.pay.month(murat, "2026-09");
    const hk = sept.people[1]!.memberId;
    const before = await app.money.get(murat);
    expect(await code(app.pay.payout(murat, { key: key(), memberId: hk, month: "2026-09", amountKurus: 500_001, method: "cash", from: "reserve" }))).toBe(
      "PAY_OVERPAY",
    );
    expect(await code(app.pay.payout(hakan, { key: key(), memberId: hk, month: "2026-09", amountKurus: 100_000, method: "cash", from: "reserve" }))).toBe(
      "FORBIDDEN",
    );
    expect(await code(app.pay.payout(murat, { key: key(), memberId: hk, month: "2026-11", amountKurus: 1, method: "bank" }))).toBe("PAY_MONTH_INVALID");
    expect(await code(app.pay.payout(murat, { key: key(), memberId: hk, month: "2026-10", amountKurus: 1, method: "bank", paidOn: "2026-09-30" }))).toBe(
      "DATE_INVALID",
    );

    const k = key();
    let view = await app.pay.payout(murat, { key: k, memberId: hk, month: "2026-09", amountKurus: 500_000, method: "cash", from: "reserve", note: "Elden" });
    await app.pay.payout(murat, { key: k, memberId: hk, month: "2026-09", amountKurus: 500_000, method: "cash", from: "reserve" });
    expect(view.people[1]).toMatchObject({ paidKurus: 3_640_000, leftKurus: 0 });
    const payout = view.people[1]!.payouts[1]!;
    expect(payout).toMatchObject({ amountKurus: 500_000, method: "cash", account: "reserve", paidOn: "2026-10-16", note: "Elden", by: "Murat Aksu" });
    let money = await app.money.get(murat);
    expect(money.reserveKurus).toBe(before.reserveKurus! - 500_000);
    expect(money.lines[0]).toMatchObject({ account: "reserve", kind: "wages", amountKurus: -500_000, label: "Hakan Usta" });

    // From the drawer when it's open, as Kasa shows it.
    await app.cash.open(ece, { key: key(), countKurus: 300_000 });
    const e = sept.people[2]!.memberId;
    await app.pay.setRate(murat, "2026-10", { memberId: e, kurusPerHour: 16_500, fromDay: "2026-10-16" });
    view = await app.pay.payout(hakan, { key: key(), memberId: e, month: "2026-10", amountKurus: 100_000, method: "cash" });
    expect(view.people[2]!.payouts[0]).toMatchObject({ account: "drawer", by: "Hakan Usta" });
    expect((await app.cash.state(ece)).open!.moves.map((m) => [m.kind, m.amountKurus, m.reason])).toEqual([["out", 100_000, "Maaş · Ece Tan"]]);

    view = await app.pay.removePayout(murat, payout.id);
    expect(view.people[1]).toMatchObject({ leftKurus: 500_000 });
    money = await app.money.get(murat);
    expect(money.reserveKurus).toBe(before.reserveKurus);
    expect(await code(app.pay.removePayout(murat, payout.id))).toBe("PAYOUT_NOT_FOUND");
  });

  it("closes a pay month once its hours are in, keeps them, and still lets what is owed be paid", async () => {
    const sept = await app.pay.month(murat, "2026-09");
    const [m, hk] = sept.people.map((p) => p.memberId) as [string, string];
    expect(await code(app.pay.close(ece, { month: "2026-09" }))).toBe("FORBIDDEN");
    expect(await code(app.pay.close(murat, { month: "2026-10" }))).toBe("PAY_NOT_CLOSABLE");

    // A planned day without hours holds the close.
    await app.pay.setHours(murat, "2026-09", { days: [{ memberId: m, day: "2026-09-14", minutes: null }] });
    expect(await app.pay.month(murat, "2026-09")).toMatchObject({ canClose: false, closeBlock: "MISSING_DAYS" });
    expect(await code(app.pay.close(murat, { month: "2026-09" }))).toBe("PAY_MISSING_DAYS");
    await app.pay.setHours(murat, "2026-09", { days: [{ memberId: m, day: "2026-09-14", minutes: h(8) }] });

    let view = await app.pay.close(murat, { month: "2026-09", note: "Bordro hazır" });
    expect(view).toMatchObject({ payClosedThrough: "2026-09-30", canClose: false, closeBlock: "ALREADY_CLOSED" });
    expect(view.close).toMatchObject({ month: "2026-09", by: "Murat Aksu", note: "Bordro hazır", canReopen: true });
    expect(view.close!.summary).toMatchObject({ minutes: 33_240, earnedKurus: 10_676_000, paidKurus: 10_176_000 });
    expect(view.close!.summary.people.map((p) => [p.name, p.earnedKurus])).toEqual([
      ["Murat Aksu", 4_576_000],
      ["Hakan Usta", 3_640_000],
      ["Ece Tan", 2_460_000],
    ]);
    expect(await code(app.pay.close(murat, { month: "2026-09" }))).toBe("PAY_NOT_CLOSABLE");

    // Hours and rates in it are kept; Hakan's last ₺5.000 can still be paid.
    expect(await code(app.pay.setHours(murat, "2026-09", { days: [{ memberId: m, day: "2026-09-14", minutes: h(9) }] }))).toBe("PAY_CLOSED");
    expect(await code(app.pay.setRate(murat, "2026-09", { memberId: m, kurusPerHour: 1, fromDay: "2026-09-30" }))).toBe("PAY_CLOSED");
    expect(await code(app.pay.removeRate(murat, "2026-10", (await app.pay.month(murat)).people[0]!.rates[0]!.id))).toBe("PAY_CLOSED");
    view = await app.pay.payout(murat, { key: key(), memberId: hk, month: "2026-09", amountKurus: 500_000, method: "bank" });
    expect(view.people[1]!.leftKurus).toBe(0);
    // Ece sees the close, with only her own line.
    expect((await app.pay.month(ece, "2026-09")).close!.summary.people.map((p) => p.name)).toEqual(["Ece Tan"]);

    // Reopened with a reason: hours can change again, and it closes anew.
    expect(await code(app.pay.reopen(murat, view.close!.id, { reason: " " }))).toBe("NOTE_REQUIRED");
    view = await app.pay.reopen(murat, view.close!.id, { reason: "Eksik mesai" });
    expect(view).toMatchObject({ close: null, payClosedThrough: null, closeBlock: null });
    expect(view.history).toMatchObject([{ reopenedBy: "Murat Aksu", reopenReason: "Eksik mesai", canReopen: false }]);
    await app.pay.setHours(murat, "2026-09", { days: [{ memberId: m, day: "2026-09-14", minutes: h(9) }] });
    view = await app.pay.close(murat, { month: "2026-09" });
    expect(view.close!.summary.minutes).toBe(33_300);

    // Once Ay kapanışı closes September, its pay close stays.
    await app.money.closeMonth(leyla, { month: "2026-09" });
    expect((await app.pay.month(murat, "2026-09")).close!.canReopen).toBe(false);
    expect(await code(app.pay.reopen(murat, view.close!.id, { reason: "x" }))).toBe("PERIOD_CLOSED");
  });

  it("exports the month for Excel, and counts wages in the month's numbers", async () => {
    const { filename, csv } = await app.pay.exportCsv(murat, "2026-09");
    expect(filename).toBe("puantaj-moda-2026-09.csv");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("﻿Tarih;Çalışan;Planlanan saat;Çalışılan saat;Saat ücreti (TL);Tutar (TL)");
    expect(lines).toContain("2026-09-01;Murat Aksu;8,00;8,00;220,00;1760,00");
    // Ece's day off ill: planned, worked none.
    expect(lines).toContain("2026-09-17;Ece Tan;8,00;0,00;150,00;0,00");
    expect(lines).toContain("Hakan Usta;Şef;182,00;36400,00;31400,00;5000,00");
    expect(lines).toContain("Toplam;;554,00;106760,00;101760,00;5000,00");
    expect(await code(app.pay.exportCsv(ece, "2026-09"))).toBe("FORBIDDEN");

    const months = await app.money.months(leyla);
    expect(months.next!.summary.wages).toEqual({ earnedKurus: 10_676_000, paidKurus: 0 });
  });
});
