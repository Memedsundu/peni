import type { CashCount, CashCounts, CashMove, CashSession, CashStore } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type CashSession as Row } from "./generated/client";

const json = (counts: CashCounts | null) => counts ?? Prisma.DbNull;

function toRow(s: CashSession) {
  return {
    id: s.id,
    cafeId: s.cafeId,
    openCafeId: s.closing ? null : s.cafeId,
    openedAt: s.opening.at,
    openedByMemberId: s.opening.byMemberId,
    openingExpectedKurus: s.opening.expectedKurus,
    openingCountKurus: s.opening.countKurus,
    openingDifferenceKurus: s.opening.differenceKurus,
    openingCounts: json(s.opening.counts),
    openingNote: s.opening.note,
    openKey: s.openKey,
    closedAt: s.closing?.at ?? null,
    closedByMemberId: s.closing?.byMemberId ?? null,
    closingExpectedKurus: s.closing?.expectedKurus ?? null,
    closingCountKurus: s.closing?.countKurus ?? null,
    closingDifferenceKurus: s.closing?.differenceKurus ?? null,
    closingCounts: json(s.closing?.counts ?? null),
    closingNote: s.closing?.note ?? null,
    closeKey: s.closeKey,
  };
}

function toSession(r: Row): CashSession {
  const closing: CashCount | null =
    r.closedAt && r.closedByMemberId && r.closingCountKurus !== null
      ? {
          at: r.closedAt,
          byMemberId: r.closedByMemberId,
          expectedKurus: r.closingExpectedKurus,
          countKurus: r.closingCountKurus,
          differenceKurus: r.closingDifferenceKurus ?? 0,
          counts: (r.closingCounts as CashCounts | null) ?? null,
          note: r.closingNote,
        }
      : null;
  return {
    id: r.id,
    cafeId: r.cafeId,
    opening: {
      at: r.openedAt,
      byMemberId: r.openedByMemberId,
      expectedKurus: r.openingExpectedKurus,
      countKurus: r.openingCountKurus,
      differenceKurus: r.openingDifferenceKurus,
      counts: (r.openingCounts as CashCounts | null) ?? null,
      note: r.openingNote,
    },
    closing,
    openKey: r.openKey,
    closeKey: r.closeKey,
  };
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class PrismaCashStore implements CashStore {
  constructor(private readonly db: Db) {}

  async saveSession(session: CashSession): Promise<boolean> {
    const row = toRow(session);
    try {
      await this.db().cashSession.upsert({ where: { id: session.id }, create: row, update: row });
      return true;
    } catch (error) {
      // Another till opened the drawer a moment ago: one open session per café.
      if (isUniqueClash(error)) return false;
      throw error;
    }
  }

  async getSession(cafeId: string, id: string): Promise<CashSession | null> {
    const r = await this.db().cashSession.findFirst({ where: { id, cafeId } });
    return r ? toSession(r) : null;
  }

  async openSession(cafeId: string): Promise<CashSession | null> {
    const r = await this.db().cashSession.findUnique({ where: { openCafeId: cafeId } });
    return r ? toSession(r) : null;
  }

  async lastClosed(cafeId: string): Promise<CashSession | null> {
    const r = await this.db().cashSession.findFirst({ where: { cafeId, closedAt: { not: null } }, orderBy: { closedAt: "desc" } });
    return r ? toSession(r) : null;
  }

  async findByKey(cafeId: string, key: string): Promise<CashSession | null> {
    const r = await this.db().cashSession.findFirst({ where: { cafeId, OR: [{ openKey: key }, { closeKey: key }] } });
    return r ? toSession(r) : null;
  }

  async listSessions(cafeId: string, limit: number): Promise<CashSession[]> {
    const rows = await this.db().cashSession.findMany({ where: { cafeId }, orderBy: { openedAt: "desc" }, take: limit });
    return rows.map(toSession);
  }

  async saveMove(move: CashMove): Promise<boolean> {
    try {
      await this.db().cashMove.upsert({ where: { id: move.id }, create: move, update: move });
      return true;
    } catch (error) {
      if (isUniqueClash(error)) return false;
      throw error;
    }
  }

  async findMoveByKey(cafeId: string, key: string): Promise<CashMove | null> {
    return this.db().cashMove.findUnique({ where: { cafeId_key: { cafeId, key } } });
  }

  async listMoves(cafeId: string, sessionId: string): Promise<CashMove[]> {
    return this.db().cashMove.findMany({ where: { cafeId, sessionId }, orderBy: [{ at: "asc" }, { id: "asc" }] });
  }

  async removeMove(cafeId: string, id: string): Promise<void> {
    await this.db().cashMove.deleteMany({ where: { id, cafeId } });
  }
}
