import type { AlertDigest, TaskAssign, TaskCheck, TaskItem, TaskList, TaskStatus, TaskStore, Weekday } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type TaskCheck as CheckRow, type TaskItem as ItemRow, type TaskList as ListRow } from "./generated/client";

const toList = (r: ListRow): TaskList => ({ ...r, assign: r.assign as TaskAssign });
const toItem = (r: ItemRow): TaskItem => ({ ...r, days: r.days as Weekday[] });
const toCheck = (r: CheckRow): TaskCheck => ({ ...r, status: r.status as TaskStatus });

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export class PrismaTaskStore implements TaskStore {
  constructor(private readonly db: Db) {}

  async listLists(cafeId: string, opts: { includeArchived?: boolean } = {}): Promise<TaskList[]> {
    const rows = await this.db().taskList.findMany({
      where: { cafeId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map(toList);
  }

  async getList(cafeId: string, id: string): Promise<TaskList | null> {
    const r = await this.db().taskList.findFirst({ where: { id, cafeId } });
    return r ? toList(r) : null;
  }

  async saveList(list: TaskList): Promise<void> {
    await this.db().taskList.upsert({ where: { id: list.id }, create: list, update: list });
  }

  async listItems(cafeId: string): Promise<TaskItem[]> {
    return (await this.db().taskItem.findMany({ where: { cafeId }, orderBy: [{ listId: "asc" }, { sortOrder: "asc" }] })).map(toItem);
  }

  async saveItems(items: TaskItem[]): Promise<void> {
    for (const i of items) await this.db().taskItem.upsert({ where: { id: i.id }, create: i, update: i });
  }

  async listChecks(cafeId: string, from: string, through: string): Promise<TaskCheck[]> {
    const rows = await this.db().taskCheck.findMany({ where: { cafeId, day: { gte: from, lte: through } }, orderBy: [{ day: "asc" }, { at: "asc" }] });
    return rows.map(toCheck);
  }

  async saveCheck(check: TaskCheck): Promise<void> {
    const where = { cafeId_itemId_day: { cafeId: check.cafeId, itemId: check.itemId, day: check.day } };
    await this.db().taskCheck.upsert({ where, create: check, update: check });
  }

  async removeCheck(cafeId: string, itemId: string, day: string): Promise<void> {
    await this.db().taskCheck.deleteMany({ where: { cafeId, itemId, day } });
  }

  async getDigest(cafeId: string, day: string): Promise<AlertDigest | null> {
    return this.db().alertDigest.findUnique({ where: { cafeId_day: { cafeId, day } } });
  }

  async addDigest(digest: AlertDigest): Promise<boolean> {
    try {
      await this.db().alertDigest.create({ data: digest });
      return true;
    } catch (error) {
      if (isUniqueClash(error)) return false;
      throw error;
    }
  }

  async listMuted(cafeId: string): Promise<string[]> {
    return (await this.db().alertMute.findMany({ where: { cafeId }, orderBy: { memberId: "asc" } })).map((r) => r.memberId);
  }

  async setMuted(cafeId: string, memberId: string, muted: boolean): Promise<void> {
    if (muted) await this.db().alertMute.upsert({ where: { cafeId_memberId: { cafeId, memberId } }, create: { cafeId, memberId }, update: {} });
    else await this.db().alertMute.deleteMany({ where: { cafeId, memberId } });
  }
}
