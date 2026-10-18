import type { PayClose, PayMethod, PayoutQuery, PayPayout, PayRate, PaySummary, Shift, ShiftStore, ShiftWeek, WorkDay } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type PayClose as CloseRow, type PayPayout as PayoutRow } from "./generated/client";

function toPayout(r: PayoutRow): PayPayout {
  return { ...r, method: r.method as PayMethod };
}

function toClose(r: CloseRow): PayClose {
  const { standingMonth: _standing, ...rest } = r;
  return { ...rest, summary: r.summary as unknown as PaySummary };
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class PrismaShiftStore implements ShiftStore {
  constructor(private readonly db: Db) {}

  async listShifts(cafeId: string, from: string, through: string): Promise<Shift[]> {
    return this.db().shift.findMany({
      where: { cafeId, day: { gte: from, lte: through } },
      orderBy: [{ day: "asc" }, { startMinutes: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
  }

  async getShift(cafeId: string, id: string): Promise<Shift | null> {
    return this.db().shift.findFirst({ where: { id, cafeId } });
  }

  async saveShift(shift: Shift): Promise<void> {
    await this.db().shift.upsert({ where: { id: shift.id }, create: shift, update: shift });
  }

  async addShifts(shifts: Shift[]): Promise<void> {
    if (shifts.length) await this.db().shift.createMany({ data: shifts, skipDuplicates: true });
  }

  async removeShift(cafeId: string, id: string): Promise<void> {
    await this.db().shift.deleteMany({ where: { id, cafeId } });
  }

  async getWeek(cafeId: string, weekStart: string): Promise<ShiftWeek | null> {
    return this.db().shiftWeek.findUnique({ where: { cafeId_weekStart: { cafeId, weekStart } } });
  }

  async saveWeek(week: ShiftWeek): Promise<void> {
    await this.db().shiftWeek.upsert({ where: { cafeId_weekStart: { cafeId: week.cafeId, weekStart: week.weekStart } }, create: week, update: week });
  }

  async listWorkDays(cafeId: string, from: string, through: string): Promise<WorkDay[]> {
    return this.db().workDay.findMany({ where: { cafeId, day: { gte: from, lte: through } }, orderBy: [{ day: "asc" }, { memberId: "asc" }] });
  }

  async setWorkDays(cafeId: string, set: WorkDay[], cleared: { memberId: string; day: string }[]): Promise<void> {
    if (cleared.length) await this.db().workDay.deleteMany({ where: { cafeId, OR: cleared.map((c) => ({ memberId: c.memberId, day: c.day })) } });
    for (const d of set) {
      const row = { ...d, cafeId };
      await this.db().workDay.upsert({ where: { cafeId_memberId_day: { cafeId, memberId: d.memberId, day: d.day } }, create: row, update: row });
    }
  }

  async listRates(cafeId: string): Promise<PayRate[]> {
    return this.db().payRate.findMany({ where: { cafeId }, orderBy: [{ fromDay: "asc" }, { createdAt: "asc" }] });
  }

  async saveRate(rate: PayRate): Promise<void> {
    const where = { cafeId_memberId_fromDay: { cafeId: rate.cafeId, memberId: rate.memberId, fromDay: rate.fromDay } };
    await this.db().payRate.upsert({ where, create: rate, update: rate });
  }

  async removeRate(cafeId: string, id: string): Promise<void> {
    await this.db().payRate.deleteMany({ where: { id, cafeId } });
  }

  async listPayouts(cafeId: string, q: PayoutQuery = {}): Promise<PayPayout[]> {
    const rows = await this.db().payPayout.findMany({
      where: {
        cafeId,
        ...(q.month ? { month: q.month } : {}),
        ...(q.memberId ? { memberId: q.memberId } : {}),
        ...(q.paidThrough ? { paidOn: { lte: q.paidThrough } } : {}),
      },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toPayout);
  }

  async getPayout(cafeId: string, id: string): Promise<PayPayout | null> {
    const r = await this.db().payPayout.findFirst({ where: { id, cafeId } });
    return r ? toPayout(r) : null;
  }

  async addPayout(payout: PayPayout): Promise<void> {
    await this.db().payPayout.createMany({ data: [payout], skipDuplicates: true });
  }

  async removePayout(cafeId: string, id: string): Promise<void> {
    await this.db().payPayout.deleteMany({ where: { id, cafeId } });
  }

  async listPayCloses(cafeId: string): Promise<PayClose[]> {
    return (await this.db().payClose.findMany({ where: { cafeId }, orderBy: [{ closedAt: "desc" }, { id: "asc" }] })).map(toClose);
  }

  async getPayClose(cafeId: string, id: string): Promise<PayClose | null> {
    const r = await this.db().payClose.findFirst({ where: { id, cafeId } });
    return r ? toClose(r) : null;
  }

  async savePayClose(close: PayClose): Promise<boolean> {
    const row = { ...close, summary: close.summary as unknown as Prisma.InputJsonValue, standingMonth: close.reopenedAt ? null : close.month };
    try {
      await this.db().payClose.upsert({ where: { id: close.id }, create: row, update: row });
      return true;
    } catch (error) {
      // Closed a moment ago from another screen: one standing close per month.
      if (isUniqueClash(error)) return false;
      throw error;
    }
  }
}
