import type { PayCloseBlockDTO, PayCloseDTO, PayMonthDTO, PayPersonDTO, PayoutDTO } from "@peni/api";
import {
  addMonths,
  closedThrough,
  dayPay,
  localDateKey,
  monthDays,
  monthOf,
  nextMonthToClose,
  owedByMonth,
  plannedMinutes,
  plusDays,
  rateOn,
  standingCloses,
  validDate,
  validMonth,
  type PayClose,
  type PayMethod,
  type PaySummary,
  type PeniDirectory,
  type Permission,
  type ShiftStore,
  type StaffMember,
  type StaffRole,
  type StaffStore,
  type WorkDay,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { keyHash } from "./bills";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import { requirePermission, type StaffContext } from "./staff";

/** How far back the month picker goes. */
const MONTHS_BACK = 24;

export interface PayoutInput {
  key: string;
  memberId: string;
  month: string;
  amountKurus: number;
  method: PayMethod;
  from?: "drawer" | "reserve";
  paidOn?: string;
  note?: string;
}

interface Person {
  memberId: string;
  name: string;
  role: StaffRole;
  removed: boolean;
}

/**
 * Puantaj ve maaş (plan piece 21): hours worked per day, hourly rates, pay earned and paid,
 * and the pay month's close, on one page. Everyone sees their own hours and pay; "pay.hours",
 * "pay.payouts" and "pay.close" see everyone's. Pay goes out through Nakit ve banka, so a
 * payout takes the money from the drawer, the reserve or the bank like any other payment.
 */
export class PayService {
  constructor(
    private readonly store: ShiftStore,
    private readonly staff: StaffStore,
    private readonly money: MoneyService,
    private readonly directory: PeniDirectory,
    private readonly atomically: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly now: () => Date,
  ) {}

  async month(ctx: StaffContext, month?: string): Promise<PayMonthDTO> {
    const today = await this.today(ctx.cafe.id);
    const m = month ?? monthOf(today);
    this.upToNow(m, today);
    return this.dto(ctx, m, today);
  }

  /** Hours for several people and days; null clears a day. Days in a closed pay month or ahead of today are refused. */
  async setHours(ctx: StaffContext, month: string, input: { days: { memberId: string; day: string; minutes: number | null }[] }): Promise<PayMonthDTO> {
    this.require(ctx, "pay.hours");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    this.upToNow(month, today);
    for (const d of input.days) {
      if (!validDate(d.day)) throw new AppError("DATE_INVALID", "Check the date", 400);
      if (d.day > today) throw new AppError("HOURS_FUTURE", "That day hasn't come yet", 400);
      if (d.minutes !== null && (!Number.isInteger(d.minutes) || d.minutes < 0 || d.minutes > 1440))
        throw new AppError("HOURS_INVALID", "Check the hours", 400);
    }
    const days = input.days.map((d) => d.day);
    await this.assertPayOpen(cafeId, ...days);
    await this.money.assertOpen(cafeId, ...days);
    for (const id of new Set(input.days.map((d) => d.memberId))) await this.member(cafeId, id);
    const set: WorkDay[] = [];
    const cleared: { memberId: string; day: string }[] = [];
    for (const d of input.days) {
      if (d.minutes === null) cleared.push({ memberId: d.memberId, day: d.day });
      else set.push({ cafeId, memberId: d.memberId, day: d.day, minutes: d.minutes, note: null, byId: ctx.member.id, updatedAt: this.now() });
    }
    await this.atomically(() => this.store.setWorkDays(cafeId, set, cleared));
    return this.month(ctx, month);
  }

  /** An hourly rate from a day on. A rate from the same day replaces it. */
  async setRate(ctx: StaffContext, month: string, input: { memberId: string; kurusPerHour: number; fromDay: string }): Promise<PayMonthDTO> {
    this.require(ctx, "pay.hours");
    const cafeId = ctx.cafe.id;
    this.upToNow(month, await this.today(cafeId));
    if (!validDate(input.fromDay)) throw new AppError("DATE_INVALID", "Check the date", 400);
    if (!Number.isInteger(input.kurusPerHour) || input.kurusPerHour <= 0 || input.kurusPerHour > 1_000_000)
      throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    await this.member(cafeId, input.memberId);
    await this.assertPayOpen(cafeId, input.fromDay);
    await this.money.assertOpen(cafeId, input.fromDay);
    await this.store.saveRate({
      id: `prt_${randomUUID()}`,
      cafeId,
      memberId: input.memberId,
      fromDay: input.fromDay,
      kurusPerHour: input.kurusPerHour,
      byId: ctx.member.id,
      createdAt: this.now(),
    });
    return this.month(ctx, month);
  }

  async removeRate(ctx: StaffContext, month: string, rateId: string): Promise<PayMonthDTO> {
    this.require(ctx, "pay.hours");
    const cafeId = ctx.cafe.id;
    this.upToNow(month, await this.today(cafeId));
    const rate = (await this.store.listRates(cafeId)).find((r) => r.id === rateId);
    if (!rate) throw new AppError("RATE_NOT_FOUND", "No such rate", 404);
    await this.assertPayOpen(cafeId, rate.fromDay);
    await this.money.assertOpen(cafeId, rate.fromDay);
    await this.store.removeRate(cafeId, rateId);
    return this.month(ctx, month);
  }

  /** "Öde": pay against a month, at most what is left of it. The same `key` pays once. */
  async payout(ctx: StaffContext, input: PayoutInput): Promise<PayMonthDTO> {
    this.require(ctx, "pay.payouts");
    const cafeId = ctx.cafe.id;
    const id = `ppo_${keyHash(cafeId, input.key)}`;
    const today = await this.today(cafeId);
    this.upToNow(input.month, today);
    if (!Number.isInteger(input.amountKurus) || input.amountKurus <= 0 || input.amountKurus > 100_000_000)
      throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    const paidOn = input.paidOn ?? today;
    if (!validDate(paidOn) || paidOn > today) throw new AppError("DATE_INVALID", "Check the date", 400);
    if (paidOn < monthDays(input.month).from) throw new AppError("DATE_INVALID", "Pay for a month is paid in that month or after", 400);
    const person = await this.person(cafeId, input.memberId);
    await this.atomically(async () => {
      if (await this.store.getPayout(cafeId, id)) return;
      if (input.amountKurus > (await this.left(cafeId, input.memberId, input.month)))
        throw new AppError("PAY_OVERPAY", "That's more than is left for the month", 409);
      await this.money.assertOpen(cafeId, paidOn);
      const account = await this.money.accountFor(ctx, input.method, input.from, paidOn);
      await this.money.post(ctx, { source: `pay:${id}`, account, amountKurus: -input.amountKurus, kind: "wages", day: paidOn, label: `Maaş · ${person.name}` });
      await this.store.addPayout({
        id,
        cafeId,
        memberId: input.memberId,
        month: input.month,
        amountKurus: input.amountKurus,
        method: input.method,
        account,
        paidOn,
        note: input.note?.trim() || null,
        byId: ctx.member.id,
        createdAt: this.now(),
      });
    });
    const saved = await this.store.getPayout(cafeId, id);
    return this.month(ctx, saved?.month ?? input.month);
  }

  /** Takes a payout back, with its money, while its day's month is open. */
  async removePayout(ctx: StaffContext, payoutId: string): Promise<PayMonthDTO> {
    this.require(ctx, "pay.payouts");
    const cafeId = ctx.cafe.id;
    const payout = await this.store.getPayout(cafeId, payoutId);
    if (!payout) throw new AppError("PAYOUT_NOT_FOUND", "No such payment", 404);
    await this.money.assertOpen(cafeId, payout.paidOn);
    const person = await this.person(cafeId, payout.memberId);
    await this.atomically(async () => {
      await this.money.unpost(ctx, `pay:${payoutId}`, `Maaş · ${person.name}`);
      await this.store.removePayout(cafeId, payoutId);
    });
    return this.month(ctx, payout.month);
  }

  /** "Ayı kapat": once the month is over and every planned day has its hours. Keeps the month's numbers. */
  async close(ctx: StaffContext, input: { month: string; note?: string }): Promise<PayMonthDTO> {
    this.require(ctx, "pay.close");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    const closes = await this.store.listPayCloses(cafeId);
    if (input.month !== nextMonthToClose(closes, today)) throw new AppError("PAY_NOT_CLOSABLE", "Pay months close in order, once over", 409);
    const view = await this.dto({ ...ctx, permissions: new Set([...ctx.permissions, "pay.hours"]) }, input.month, today);
    if (view.totals.missingDays > 0) throw new AppError("PAY_MISSING_DAYS", "Enter the missing days first", 409);
    const summary: PaySummary = {
      month: input.month,
      minutes: view.totals.minutes,
      earnedKurus: view.totals.earnedKurus,
      paidKurus: view.totals.paidKurus,
      people: view.people
        .filter((p) => p.minutes || p.earnedKurus || p.paidKurus)
        .map((p) => ({ memberId: p.memberId, name: p.name, role: p.role, minutes: p.minutes, earnedKurus: p.earnedKurus, paidKurus: p.paidKurus })),
    };
    const saved = await this.store.savePayClose({
      id: `pcl_${randomUUID()}`,
      cafeId,
      month: input.month,
      closedAt: this.now(),
      closedById: ctx.member.id,
      note: input.note?.trim() || null,
      summary,
      reopenedAt: null,
      reopenedById: null,
      reopenReason: null,
    });
    if (!saved) throw new AppError("PAY_ALREADY_CLOSED", "That month was just closed", 409);
    return this.month(ctx, input.month);
  }

  /** "Yeniden aç": the latest pay close only, with a reason, while Ay kapanışı hasn't closed the month. */
  async reopen(ctx: StaffContext, closeId: string, input: { reason: string }): Promise<PayMonthDTO> {
    this.require(ctx, "pay.close");
    const cafeId = ctx.cafe.id;
    const close = await this.store.getPayClose(cafeId, closeId);
    if (!close || close.reopenedAt) throw new AppError("MONTH_NOT_FOUND", "No such close", 404);
    if (standingCloses(await this.store.listPayCloses(cafeId))[0]?.id !== close.id)
      throw new AppError("REOPEN_LATEST_ONLY", "Only the last closed month can be reopened", 409);
    const reason = input.reason.trim();
    if (!reason) throw new AppError("NOTE_REQUIRED", "Write why", 400);
    await this.money.assertOpen(cafeId, monthDays(close.month).to);
    await this.store.savePayClose({ ...close, reopenedAt: this.now(), reopenedById: ctx.member.id, reopenReason: reason.slice(0, 200) });
    return this.month(ctx, close.month);
  }

  /** The month's hours and pay for Excel: each person's days, then each person's totals. */
  async exportCsv(ctx: StaffContext, month: string): Promise<{ filename: string; csv: string }> {
    this.require(ctx, "pay.hours");
    const view = await this.month(ctx, month);
    const hours = (m: number | null) => (m === null ? "" : (m / 60).toFixed(2).replace(".", ","));
    const tl = (k: number) => (k / 100).toFixed(2).replace(".", ",");
    const cell = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows: string[][] = [["Tarih", "Çalışan", "Planlanan saat", "Çalışılan saat", "Saat ücreti (TL)", "Tutar (TL)"]];
    const rates = await this.store.listRates(ctx.cafe.id);
    for (const p of view.people) {
      view.days.forEach((day, i) => {
        const worked = p.worked[i] ?? null;
        if (worked === null && !p.planned[i]) return;
        const rate = rateOn(rates, p.memberId, day);
        rows.push([day, p.name, hours(p.planned[i] ?? 0), hours(worked), rate === null ? "" : tl(rate), tl(dayPay(worked ?? 0, rate))]);
      });
    }
    rows.push([]);
    rows.push(["Çalışan", "Rol", "Saat", "Hak edilen (TL)", "Ödenen (TL)", "Kalan (TL)"]);
    for (const p of view.people) rows.push([p.name, ROLE_TR[p.role], hours(p.minutes), tl(p.earnedKurus), tl(p.paidKurus), tl(p.leftKurus)]);
    rows.push(["Toplam", "", hours(view.totals.minutes), tl(view.totals.earnedKurus), tl(view.totals.paidKurus), tl(view.totals.leftKurus)]);
    const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
    return { filename: `puantaj-${ctx.cafe.slug}-${month}.csv`, csv };
  }

  /**
   * For Bugün's alerts (piece 22): planned days that passed without hours (this month and
   * last, unless closed), last month's pay still open after the 3rd, and pay left unpaid
   * for months that ended.
   */
  async attention(cafeId: string): Promise<{
    missing: { count: number; names: string[]; month: string };
    closeDue: string | null;
    left: { month: string; kurus: number; names: string[] }[];
  }> {
    const today = await this.today(cafeId);
    const current = monthOf(today);
    const previous = addMonths(current, -1);
    const closes = await this.store.listPayCloses(cafeId);
    const payClosedThrough = closedThrough(closes);
    const from = monthDays(previous).from;
    const [shifts, workDays, rates, payouts] = await Promise.all([
      this.store.listShifts(cafeId, from, plusDays(today, -1)),
      this.store.listWorkDays(cafeId, monthDays(addMonths(current, -MONTHS_BACK + 1)).from, today),
      this.store.listRates(cafeId),
      this.store.listPayouts(cafeId),
    ]);

    const worked = new Set(workDays.map((d) => `${d.memberId}|${d.day}`));
    const missingBy = new Map<string, number>();
    let missingMonth = current;
    for (const [key, minutes] of plannedMinutes(shifts)) {
      const [memberId, day] = key.split("|") as [string, string];
      if (minutes <= 0 || day >= today || worked.has(key) || (payClosedThrough && day <= payClosedThrough)) continue;
      missingBy.set(memberId, (missingBy.get(memberId) ?? 0) + 1);
      if (monthOf(day) < missingMonth) missingMonth = monthOf(day);
    }
    const names = await this.names(cafeId, [...missingBy.keys(), ...payouts.map((p) => p.memberId), ...workDays.map((d) => d.memberId)]);
    const missingNames = [...missingBy].sort((a, b) => b[1] - a[1]).map(([id]) => names.get(id) ?? "");

    const dayOfMonth = Number(today.slice(8, 10));
    const closeDue = dayOfMonth > 3 && nextMonthToClose(closes, today) === previous && (workDays.some((d) => monthOf(d.day) === previous) || shifts.length > 0) ? previous : null;

    const owed = owedByMonth(workDays, rates, payouts);
    const leftBy = new Map<string, { kurus: number; people: { name: string; kurus: number }[] }>();
    for (const [memberId, months] of owed) {
      for (const [month, kurus] of months) {
        if (month >= current) continue;
        const row = leftBy.get(month) ?? { kurus: 0, people: [] };
        row.kurus += kurus;
        row.people.push({ name: names.get(memberId) ?? "", kurus });
        leftBy.set(month, row);
      }
    }
    const left = [...leftBy]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, r]) => ({ month, kurus: r.kurus, names: r.people.sort((a, b) => b.kurus - a.kurus).map((p) => p.name) }));

    return { missing: { count: [...missingBy.values()].reduce((s, n) => s + n, 0), names: missingNames, month: missingMonth }, closeDue, left };
  }

  // ─────────────────────────────────────────────── helpers

  private async dto(ctx: StaffContext, month: string, today: string): Promise<PayMonthDTO> {
    const cafeId = ctx.cafe.id;
    const all = ["pay.hours", "pay.payouts", "pay.close"].some((p) => ctx.permissions.has(p as Permission));
    const { from, to } = monthDays(month);
    const days: string[] = [];
    for (let d = from; d <= to; d = plusDays(d, 1)) days.push(d);
    const [workDays, shifts, rates, payouts, closes, members] = await Promise.all([
      this.store.listWorkDays(cafeId, from, to),
      this.store.listShifts(cafeId, from, to),
      this.store.listRates(cafeId),
      this.store.listPayouts(cafeId, { month }),
      this.store.listPayCloses(cafeId),
      this.staff.listMembers(cafeId),
    ]);
    const planned = plannedMinutes(shifts);
    const payClosedThrough = closedThrough(closes);
    const closedThroughDay = await this.money.closedThrough(cafeId);

    // Who shows: the team except owners, plus anyone with hours, a shift or pay this month.
    const ids = new Set<string>(members.filter((m) => !m.removedAt && m.role !== "owner").map((m) => m.id));
    for (const d of workDays) ids.add(d.memberId);
    for (const s of shifts) for (const m of s.memberIds) ids.add(m);
    for (const p of payouts) ids.add(p.memberId);
    if (!all) for (const id of [...ids]) if (id !== ctx.member.id) ids.delete(id);
    if (!all) ids.add(ctx.member.id);
    const people = await this.people(cafeId, [...ids]);
    const names = await this.names(
      cafeId,
      payouts.map((p) => p.byId),
    );

    const canPay = ctx.permissions.has("pay.payouts");
    const canEditHours = ctx.permissions.has("pay.hours");
    const payOpen = (day: string) => !payClosedThrough || day > payClosedThrough;
    const open = (day: string) => !closedThroughDay || day > closedThroughDay;
    const rateDay = to < today ? to : today;

    const rows: PayPersonDTO[] = people.map((p) => {
      const worked = days.map((d) => workDays.find((w) => w.memberId === p.memberId && w.day === d)?.minutes ?? null);
      const plan = days.map((d) => planned.get(`${p.memberId}|${d}`) ?? 0);
      const earnedKurus = days.reduce((s, d, i) => s + dayPay(worked[i] ?? 0, rateOn(rates, p.memberId, d)), 0);
      const mine = payouts.filter((x) => x.memberId === p.memberId);
      const paidKurus = mine.reduce((s, x) => s + x.amountKurus, 0);
      return {
        ...p,
        worked,
        planned: plan,
        minutes: worked.reduce<number>((s, m) => s + (m ?? 0), 0),
        plannedMinutes: plan.reduce((s, m) => s + m, 0),
        missingDays: days.filter((d, i) => d < today && plan[i]! > 0 && worked[i] === null).length,
        rateKurus: rateOn(rates, p.memberId, rateDay),
        rates: rates
          .filter((r) => r.memberId === p.memberId)
          .map((r) => ({ id: r.id, fromDay: r.fromDay, kurusPerHour: r.kurusPerHour, canRemove: canEditHours && payOpen(r.fromDay) && open(r.fromDay) })),
        earnedKurus,
        paidKurus,
        leftKurus: Math.max(0, earnedKurus - paidKurus),
        payouts: mine.map(
          (x): PayoutDTO => ({
            id: x.id,
            amountKurus: x.amountKurus,
            method: x.method,
            account: x.account,
            paidOn: x.paidOn,
            note: x.note,
            by: names.get(x.byId) ?? null,
            canRemove: canPay && open(x.paidOn),
          }),
        ),
      };
    });
    rows.sort((a, b) => Number(a.removed) - Number(b.removed) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "tr"));

    const standing = standingCloses(closes);
    const thisMonth = closes.filter((c) => c.month === month);
    const closeNames = await this.names(
      cafeId,
      thisMonth.flatMap((c) => [c.closedById, c.reopenedById]),
    );
    const closeDto = (c: PayClose): PayCloseDTO => ({
      id: c.id,
      month: c.month,
      closedAt: c.closedAt.toISOString(),
      by: closeNames.get(c.closedById) ?? null,
      note: c.note,
      summary: all ? c.summary : { ...c.summary, people: c.summary.people.filter((x) => x.memberId === ctx.member.id) },
      reopenedAt: c.reopenedAt?.toISOString() ?? null,
      reopenedBy: c.reopenedById ? (closeNames.get(c.reopenedById) ?? null) : null,
      reopenReason: c.reopenReason,
      canReopen: !c.reopenedAt && standing[0]?.id === c.id && ctx.permissions.has("pay.close") && open(monthDays(c.month).to),
    });
    const totals = {
      minutes: rows.reduce((s, r) => s + r.minutes, 0),
      earnedKurus: rows.reduce((s, r) => s + r.earnedKurus, 0),
      paidKurus: rows.reduce((s, r) => s + r.paidKurus, 0),
      leftKurus: rows.reduce((s, r) => s + r.leftKurus, 0),
      missingDays: rows.reduce((s, r) => s + r.missingDays, 0),
    };
    const standingHere = standing.find((c) => c.month === month) ?? null;
    let closeBlock: PayCloseBlockDTO | null = null;
    if (standingHere) closeBlock = "ALREADY_CLOSED";
    else if (!ctx.permissions.has("pay.close")) closeBlock = "NO_PERMISSION";
    else if (month >= monthOf(today)) closeBlock = "NOT_OVER";
    else if (nextMonthToClose(closes, today) !== month) closeBlock = "EARLIER_OPEN";
    else if (all && totals.missingDays > 0) closeBlock = "MISSING_DAYS";

    return {
      month,
      days,
      today,
      months: await this.months(cafeId, today),
      own: !all,
      people: rows,
      totals,
      close: standingHere ? closeDto(standingHere) : null,
      history: thisMonth.filter((c) => c.reopenedAt).map(closeDto),
      canClose: closeBlock === null,
      closeBlock,
      canEditHours,
      canPay,
      payClosedThrough,
      closedThrough: closedThroughDay,
      cashFrom: canPay ? await this.money.cashFrom(cafeId, ctx.permissions) : null,
    };
  }

  /** What is left of a person's pay for a month. */
  private async left(cafeId: string, memberId: string, month: string): Promise<number> {
    const { from, to } = monthDays(month);
    const [days, rates, payouts] = await Promise.all([
      this.store.listWorkDays(cafeId, from, to),
      this.store.listRates(cafeId),
      this.store.listPayouts(cafeId, { month, memberId }),
    ]);
    const earned = days.filter((d) => d.memberId === memberId).reduce((s, d) => s + dayPay(d.minutes, rateOn(rates, memberId, d.day)), 0);
    return earned - payouts.reduce((s, p) => s + p.amountKurus, 0);
  }

  /** From the first month with hours or pay in it (or this one) to this one, newest first. */
  private async months(cafeId: string, today: string): Promise<string[]> {
    const current = monthOf(today);
    const earliest = addMonths(current, -MONTHS_BACK + 1);
    const [days, payouts] = await Promise.all([this.store.listWorkDays(cafeId, monthDays(earliest).from, today), this.store.listPayouts(cafeId)]);
    let first = current;
    for (const m of [...days.map((d) => monthOf(d.day)), ...payouts.map((p) => p.month)]) if (m < first) first = m;
    if (first < earliest) first = earliest;
    const out: string[] = [];
    for (let m = current; m >= first; m = addMonths(m, -1)) out.push(m);
    return out;
  }

  private upToNow(month: string, today: string): void {
    if (!validMonth(month) || month > monthOf(today)) throw new AppError("PAY_MONTH_INVALID", "Pick a month up to this one", 400);
  }

  private async assertPayOpen(cafeId: string, ...days: string[]): Promise<void> {
    const through = closedThrough(await this.store.listPayCloses(cafeId));
    if (through && days.some((d) => d <= through)) throw new AppError("PAY_CLOSED", "That pay month is closed", 409);
  }

  /** On the team now: hours and rates are only set for them. */
  private async member(cafeId: string, memberId: string): Promise<StaffMember> {
    const m = await this.staff.getMember(memberId);
    if (!m || m.cafeId !== cafeId || m.removedAt) throw new AppError("NOT_ON_TEAM", "That person isn't on the team", 400);
    return m;
  }

  /** Anyone who was on the team: pay still owed to someone who left can be paid. */
  private async person(cafeId: string, memberId: string): Promise<Person> {
    const [p] = await this.people(cafeId, [memberId]);
    if (!p) throw new AppError("NOT_ON_TEAM", "That person isn't on the team", 400);
    return p;
  }

  private async people(cafeId: string, ids: string[]): Promise<Person[]> {
    const out: Person[] = [];
    for (const id of ids) {
      const m = await this.staff.getMember(id);
      if (!m || m.cafeId !== cafeId) continue;
      const account = await this.staff.getAccount(m.accountId);
      if (account) out.push({ memberId: id, name: account.name, role: m.role, removed: !!m.removedAt });
    }
    return out;
  }

  private async names(cafeId: string, ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    return new Map((await this.people(cafeId, unique)).map((p) => [p.memberId, p.name]));
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
  }

  private require(ctx: StaffContext, permission: Permission): void {
    requirePermission(ctx, permission);
  }
}

const ROLE_ORDER = { owner: 0, manager: 1, chef: 2, barista: 3 } as const;
const ROLE_TR: Record<StaffRole, string> = { owner: "Sahip", manager: "Müdür", chef: "Şef", barista: "Barista" };
