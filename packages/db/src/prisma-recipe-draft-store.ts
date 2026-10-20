import type { DraftStatus, RecipeDraft, RecipeDraftStore, RecipeProposal } from "@peni/core";
import type { Db } from "./db";
import type { Prisma, RecipeDraft as RecipeDraftRow } from "./generated/client";

const toDraft = (r: RecipeDraftRow): RecipeDraft => ({ ...r, status: r.status as DraftStatus, proposal: r.proposal as unknown as RecipeProposal });

export class PrismaRecipeDraftStore implements RecipeDraftStore {
  constructor(private readonly db: Db) {}

  async saveRecipeDraft(draft: RecipeDraft): Promise<void> {
    const data = { ...draft, proposal: draft.proposal as unknown as Prisma.InputJsonValue };
    await this.db().recipeDraft.upsert({ where: { id: draft.id }, create: data, update: data });
  }

  async getRecipeDraft(cafeId: string, id: string): Promise<RecipeDraft | null> {
    const r = await this.db().recipeDraft.findFirst({ where: { id, cafeId } });
    return r ? toDraft(r) : null;
  }

  async listOpenRecipeDrafts(cafeId: string): Promise<RecipeDraft[]> {
    const rows = await this.db().recipeDraft.findMany({ where: { cafeId, status: "open" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return rows.map(toDraft);
  }

  async countRecipeDraftsSince(cafeId: string, since: Date): Promise<number> {
    return this.db().recipeDraft.count({ where: { cafeId, createdAt: { gte: since } } });
  }
}
