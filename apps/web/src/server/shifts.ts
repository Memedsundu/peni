import type { ShiftDTO, ShiftPersonDTO, ShiftWeekDTO } from "@peni/api";
import {
  isMonday,
  localDateKey,
  overlaps,
  plusDays,
  shiftMinutes,
  shiftTimesProblem,
  validDate,
  weekDays,
  weekStartOf,
  type PeniDirectory,
  type Permission,
  type Shift,
  type ShiftStore,
  type StaffStore,
} from "@peni/core";
import { keyHash } from "./bills";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { StaffContext } from "./staff";

export interface ShiftInput {
  day: string;
  start: number;
  end: number;
  memberIds: string[];
  note?: string | null;
}

/** Tells each person on a published week their shifts. Never fails the publish. */
export type ShiftNotifier = (ctx: StaffContext, weekStart: string, shifts: Shift[], people: Map<string, ShiftPersonDTO>) => Promise<void>;

/**
 * Vardiyalar (plan piece 21): the weekly plan. Anyone with "shifts.view" sees a week once
 * it is published; "shifts.edit" plans it, copies last week and publishes. Anyone on the
 * team can be put on a shift, managers too, which Shelby didn't allow.
 */
export class ShiftService {
  constructor(
    private readonly store: ShiftStore,
    private readonly staff: StaffStore,
    private readonly money: MoneyService,
    private readonly directory: PeniDirectory,
    private readonly notify: ShiftNotifier | null,
    private readonly now: () => Date,
  ) {}

  async week(ctx: StaffContext, week?: string): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.view");
    const today = await this.today(ctx.cafe.id);
    const weekStart = week ?? weekStartOf(today);
    this.monday(weekStart);
    return this.dto(ctx, weekStart, today);
  }

  async add(ctx: StaffContext, input: ShiftInput & { key: string }): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.edit");
    const cafeId = ctx.cafe.id;
    const id = `shf_${keyHash(cafeId, input.key)}`;
    if (!(await this.store.getShift(cafeId, id))) {
      const shift: Shift = {
        id,
        cafeId,
        day: input.day,
        startMinutes: input.start,
        endMinutes: input.end,
        memberIds: [...new Set(input.memberIds)],
        note: input.note?.trim() || null,
        createdById: ctx.member.id,
        createdAt: this.now(),
        updatedAt: this.now(),
      };
      await this.check(cafeId, shift);
      await this.store.saveShift(shift);
    }
    const saved = await this.store.getShift(cafeId, id);
    return this.week(ctx, weekStartOf(saved?.day ?? input.day));
  }

  async update(ctx: StaffContext, shiftId: string, input: Partial<ShiftInput>): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.edit");
    const cafeId = ctx.cafe.id;
    const old = await this.shift(cafeId, shiftId);
    await this.money.assertOpen(cafeId, old.day);
    const shift: Shift = {
      ...old,
      day: input.day ?? old.day,
      startMinutes: input.start ?? old.startMinutes,
      endMinutes: input.end ?? old.endMinutes,
      memberIds: input.memberIds ? [...new Set(input.memberIds)] : old.memberIds,
      note: input.note === undefined ? old.note : input.note?.trim() || null,
      updatedAt: this.now(),
    };
    await this.check(cafeId, shift, old.memberIds);
    await this.store.saveShift(shift);
    return this.week(ctx, weekStartOf(shift.day));
  }

  async remove(ctx: StaffContext, shiftId: string): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.edit");
    const cafeId = ctx.cafe.id;
    const shift = await this.shift(cafeId, shiftId);
    await this.money.assertOpen(cafeId, shift.day);
    await this.store.removeShift(cafeId, shiftId);
    return this.week(ctx, weekStartOf(shift.day));
  }

  /** "Geçen haftayı kopyala": last week's shifts into an empty week, without people no longer on the team. */
  async copy(ctx: StaffContext, input: { week: string }): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.edit");
    const cafeId = ctx.cafe.id;
    this.monday(input.week);
    const end = plusDays(input.week, 6);
    await this.money.assertOpen(cafeId, input.week);
    if ((await this.store.listShifts(cafeId, input.week, end)).length) throw new AppError("WEEK_NOT_EMPTY", "This week already has shifts", 409);
    const team = new Set((await this.staff.listMembers(cafeId)).filter((m) => !m.removedAt).map((m) => m.id));
    const copies = (await this.store.listShifts(cafeId, plusDays(input.week, -7), plusDays(input.week, -1)))
      .map((s) => ({ ...s, memberIds: s.memberIds.filter((m) => team.has(m)) }))
      .filter((s) => s.memberIds.length > 0)
      .map((s) => ({
        ...s,
        id: `shf_${keyHash(cafeId, `copy:${input.week}:${s.id}`)}`,
        day: plusDays(s.day, 7),
        createdById: ctx.member.id,
        createdAt: this.now(),
        updatedAt: this.now(),
      }));
    if (!copies.length) throw new AppError("NOTHING_TO_COPY", "Last week has no shifts", 409);
    await this.store.addShifts(copies);
    return this.week(ctx, input.week);
  }

  /** "Yayınla": everyone sees the week, and each person on it is told their shifts. Or back to a draft. */
  async publish(ctx: StaffContext, input: { week: string; published: boolean }): Promise<ShiftWeekDTO> {
    this.require(ctx, "shifts.edit");
    const cafeId = ctx.cafe.id;
    this.monday(input.week);
    const was = await this.store.getWeek(cafeId, input.week);
    await this.store.saveWeek({
      cafeId,
      weekStart: input.week,
      publishedAt: input.published ? (was?.publishedAt ?? this.now()) : null,
      publishedById: input.published ? (was?.publishedById ?? ctx.member.id) : null,
    });
    if (input.published && !was?.publishedAt && this.notify) {
      const shifts = await this.store.listShifts(cafeId, input.week, plusDays(input.week, 6));
      const people = await this.people(
        cafeId,
        shifts.flatMap((s) => s.memberIds),
      );
      try {
        await this.notify(ctx, input.week, shifts, people);
      } catch (error) {
        console.error("Shift emails not sent", cafeId, input.week, error);
      }
    }
    return this.week(ctx, input.week);
  }

  // ─────────────────────────────────────────────── helpers

  private async dto(ctx: StaffContext, weekStart: string, today: string): Promise<ShiftWeekDTO> {
    const cafeId = ctx.cafe.id;
    const canEdit = ctx.permissions.has("shifts.edit");
    const days = weekDays(weekStart);
    const [shifts, week, lastWeek, members] = await Promise.all([
      this.store.listShifts(cafeId, days[0]!, days[6]!),
      this.store.getWeek(cafeId, weekStart),
      canEdit ? this.store.listShifts(cafeId, plusDays(weekStart, -7), plusDays(weekStart, -1)) : [],
      this.staff.listMembers(cafeId),
    ]);
    const visible = canEdit || !!week?.publishedAt;
    const shown = visible ? shifts : [];
    const people = await this.people(cafeId, [
      ...members.filter((m) => !m.removedAt).map((m) => m.id),
      ...shown.flatMap((s) => s.memberIds),
      week?.publishedById,
    ]);
    const person = (id: string): ShiftPersonDTO => people.get(id) ?? { memberId: id, name: "", role: "barista" };

    const minutes = new Map<string, number>();
    for (const s of shown) for (const m of s.memberIds) minutes.set(m, (minutes.get(m) ?? 0) + shiftMinutes(s));
    const totals = [...minutes].map(([id, m]) => ({ ...person(id), minutes: m })).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "tr"));
    const team = canEdit
      ? members
          .filter((m) => !m.removedAt)
          .map((m) => person(m.id))
          .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name, "tr"))
      : [];

    return {
      weekStart,
      days,
      today,
      published: !!week?.publishedAt,
      publishedAt: week?.publishedAt?.toISOString() ?? null,
      publishedBy: week?.publishedById ? person(week.publishedById).name || null : null,
      visible,
      shifts: shown.map(
        (s): ShiftDTO => ({
          id: s.id,
          day: s.day,
          start: s.startMinutes,
          end: s.endMinutes,
          people: s.memberIds.map(person),
          note: s.note,
          mine: s.memberIds.includes(ctx.member.id),
        }),
      ),
      totals,
      team,
      me: ctx.member.id,
      canEdit,
      canCopy: canEdit && shifts.length === 0 && lastWeek.length > 0,
      closedThrough: await this.money.closedThrough(cafeId),
    };
  }

  /** The shift's day, times and people make sense, nobody is on two shifts at once, and its month is open. */
  private async check(cafeId: string, shift: Shift, alreadyOn: string[] = []): Promise<void> {
    if (!validDate(shift.day)) throw new AppError("DATE_INVALID", "Check the date", 400);
    if (shiftTimesProblem(shift.startMinutes, shift.endMinutes)) throw new AppError("SHIFT_TIMES", "Check the times", 400);
    if (!shift.memberIds.length) throw new AppError("NOT_ON_TEAM", "Pick someone for the shift", 400);
    await this.money.assertOpen(cafeId, shift.day);
    for (const id of shift.memberIds) {
      const m = await this.staff.getMember(id);
      // Someone taken off the team stays on the shifts they already had, but isn't added to new ones.
      if (!m || m.cafeId !== cafeId || (m.removedAt && !alreadyOn.includes(id))) throw new AppError("NOT_ON_TEAM", "That person isn't on the team", 400);
    }
    const sameDay = (await this.store.listShifts(cafeId, shift.day, shift.day)).filter((s) => s.id !== shift.id);
    if (sameDay.some((s) => overlaps(s, shift) && s.memberIds.some((m) => shift.memberIds.includes(m)))) {
      throw new AppError("SHIFT_OVERLAP", "Someone on it is on another shift then", 409);
    }
  }

  private async shift(cafeId: string, shiftId: string): Promise<Shift> {
    const shift = await this.store.getShift(cafeId, shiftId);
    if (!shift) throw new AppError("SHIFT_NOT_FOUND", "No such shift", 404);
    return shift;
  }

  private monday(day: string): void {
    if (!validDate(day) || !isMonday(day)) throw new AppError("WEEK_INVALID", "A week starts on a Monday", 400);
  }

  private async people(cafeId: string, ids: (string | null | undefined)[]): Promise<Map<string, ShiftPersonDTO>> {
    const out = new Map<string, ShiftPersonDTO>();
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
      const member = await this.staff.getMember(id);
      if (!member || member.cafeId !== cafeId) continue;
      const account = await this.staff.getAccount(member.accountId);
      if (account) out.set(id, { memberId: id, name: account.name, role: member.role });
    }
    return out;
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}

const ROLE_ORDER = { owner: 0, manager: 1, chef: 2, barista: 3 } as const;
