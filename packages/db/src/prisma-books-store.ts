import type { BooksStore, KeptAccount, MoneyMovement, MoneyStart, MonthClose, MonthSummary, MovementQuery } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type MoneyMovement as MovementRow, type MonthClose as CloseRow } from "./generated/client";

function toMovement(r: MovementRow): MoneyMovement {
  // Only the reserve and the bank are stored as movements; the drawer is kept by its sessions.
  return { ...r, account: r.account as KeptAccount };
}

function toClose(r: CloseRow): MonthClose {
  const { standingMonth: _standing, ...rest } = r;
  return { ...rest, summary: r.summary as unknown as MonthSummary };
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class PrismaBooksStore implements BooksStore {
  constructor(private readonly db: Db) {}

  async getStart(cafeId: string): Promise<MoneyStart | null> {
    return this.db().moneyStart.findUnique({ where: { cafeId } });
  }

  async saveStart(start: MoneyStart): Promise<boolean> {
    const { count } = await this.db().moneyStart.createMany({ data: [start], skipDuplicates: true });
    return count > 0;
  }

  async addMovements(movements: MoneyMovement[]): Promise<void> {
    if (movements.length) await this.db().moneyMovement.createMany({ data: movements, skipDuplicates: true });
  }

  async listMovements(cafeId: string, q: MovementQuery = {}): Promise<MoneyMovement[]> {
    const day = q.since || q.through ? { ...(q.since ? { gte: q.since } : {}), ...(q.through ? { lte: q.through } : {}) } : undefined;
    const rows = await this.db().moneyMovement.findMany({
      where: { cafeId, ...(q.account ? { account: q.account } : {}), ...(day ? { day } : {}) },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    });
    return rows.map(toMovement);
  }

  async listBySource(cafeId: string, source: string): Promise<MoneyMovement[]> {
    return (await this.db().moneyMovement.findMany({ where: { cafeId, source } })).map(toMovement);
  }

  async removeBySource(cafeId: string, source: string): Promise<void> {
    await this.db().moneyMovement.deleteMany({ where: { cafeId, source } });
  }

  async totals(cafeId: string, through?: string): Promise<Record<KeptAccount, number>> {
    const rows = await this.db().moneyMovement.groupBy({
      by: ["account"],
      where: { cafeId, ...(through ? { day: { lte: through } } : {}) },
      _sum: { amountKurus: true },
    });
    const sum = (a: KeptAccount) => rows.find((r) => r.account === a)?._sum.amountKurus ?? 0;
    return { reserve: sum("reserve"), bank: sum("bank") };
  }

  async listCloses(cafeId: string): Promise<MonthClose[]> {
    return (await this.db().monthClose.findMany({ where: { cafeId }, orderBy: [{ closedAt: "desc" }, { id: "asc" }] })).map(toClose);
  }

  async getClose(cafeId: string, id: string): Promise<MonthClose | null> {
    const r = await this.db().monthClose.findFirst({ where: { id, cafeId } });
    return r ? toClose(r) : null;
  }

  async saveClose(close: MonthClose): Promise<boolean> {
    const row = { ...close, summary: close.summary as unknown as Prisma.InputJsonValue, standingMonth: close.reopenedAt ? null : close.month };
    try {
      await this.db().monthClose.upsert({ where: { id: close.id }, create: row, update: row });
      return true;
    } catch (error) {
      // Closed a moment ago from another screen: one standing close per month.
      if (isUniqueClash(error)) return false;
      throw error;
    }
  }
}
