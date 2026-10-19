import type { WatchDismissal, WatchStore } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

export class PrismaWatchStore implements WatchStore {
  constructor(private readonly db: Db) {}

  async listDismissed(cafeId: string): Promise<WatchDismissal[]> {
    return this.db().watchDismissal.findMany({ where: { cafeId }, orderBy: { at: "asc" } });
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
}
