import type { AskedReport, Chat, ChatMessage, ChatStore, SavedReport } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type AiChat as ChatRow, type SavedReport as SavedRow } from "./generated/client";

/** Messages are stored as JSON, their times as ISO strings. */
type StoredMessage = Omit<ChatMessage, "at"> & { at: string };

const toChat = (r: ChatRow): Chat => ({
  ...r,
  messages: (r.messages as unknown as StoredMessage[]).map((m) => ({ ...m, at: new Date(m.at) })),
});
const toSaved = (r: SavedRow): SavedReport => ({ ...r, spec: r.spec as unknown as AskedReport });
const json = (v: unknown) => v as Prisma.InputJsonValue;

export class PrismaChatStore implements ChatStore {
  constructor(private readonly db: Db) {}

  async getChat(cafeId: string, id: string): Promise<Chat | null> {
    const r = await this.db().aiChat.findFirst({ where: { id, cafeId } });
    return r ? toChat(r) : null;
  }

  async latestChat(cafeId: string, memberId: string): Promise<Chat | null> {
    const r = await this.db().aiChat.findFirst({ where: { cafeId, memberId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return r ? toChat(r) : null;
  }

  async saveChat(chat: Chat): Promise<void> {
    const { id, ...rest } = chat;
    const data = { ...rest, messages: json(chat.messages.map((m) => ({ ...m, at: m.at.toISOString() }))) };
    await this.db().aiChat.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  async questionsSince(cafeId: string, memberId: string, since: Date): Promise<number> {
    const rows = await this.db().aiChat.findMany({ where: { cafeId, memberId, updatedAt: { gte: since } } });
    return rows.reduce((n, r) => n + toChat(r).messages.filter((m) => m.role === "user" && m.at >= since).length, 0);
  }

  async listSavedReports(cafeId: string): Promise<SavedReport[]> {
    const rows = await this.db().savedReport.findMany({ where: { cafeId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toSaved);
  }

  async addSavedReport(report: SavedReport): Promise<SavedReport> {
    const same = await this.db().savedReport.findUnique({ where: { cafeId_key: { cafeId: report.cafeId, key: report.key } } });
    if (same) return toSaved(same);
    try {
      return toSaved(await this.db().savedReport.create({ data: { ...report, spec: json(report.spec) } }));
    } catch (e) {
      // Two saves at once: the other one won.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const won = await this.db().savedReport.findUnique({ where: { cafeId_key: { cafeId: report.cafeId, key: report.key } } });
        if (won) return toSaved(won);
      }
      throw e;
    }
  }

  async deleteSavedReport(cafeId: string, id: string): Promise<void> {
    await this.db().savedReport.deleteMany({ where: { cafeId, id } });
  }
}
