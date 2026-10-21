import type { WatchDismissal, WatchKind, WatchStore, WatchSuggestion } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

export class PrismaWatchStore implements WatchStore {
  constructor(private readonly db: Db) {}

  async listDismissed(cafeId: string): Promise<WatchDismissal[]> {
    const rows = await this.db().watchDismissal.findMany({ where: { cafeId }, orderBy: { at: "asc" } });
    return rows.map((r) => ({ ...r, kind: r.kind as WatchKind }));
  }

  async dismiss(d: WatchDismissal): Promise<void> {
    // The first look stands; a second one changes nothing.
    try {
      await this.db().watchDismissal.upsert({ where: { cafeId_key: { cafeId: d.cafeId, key: d.key } }, create: d, update: {} });
    } catch (e) {
      // Two people let it go at once: the other one's stands.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }

  async undismiss(cafeId: string, key: string): Promise<void> {
    await this.db().watchDismissal.deleteMany({ where: { cafeId, key } });
  }

  async noteSuggestions(cafeId: string, day: string, lines: readonly { itemId: string; orderMilli: number }[]): Promise<void> {
    // The day's first stands (see InMemoryWatchStore), all in one statement.
    if (!lines.length) return;
    await this.db().watchSuggestion.createMany({
      data: lines.map((l) => ({ cafeId, itemId: l.itemId, day, orderMilli: l.orderMilli })),
      skipDuplicates: true,
    });
  }

  async listSuggestions(cafeId: string, since: string): Promise<WatchSuggestion[]> {
    return this.db().watchSuggestion.findMany({ where: { cafeId, day: { gte: since } }, orderBy: [{ day: "asc" }, { itemId: "asc" }] });
  }
}
