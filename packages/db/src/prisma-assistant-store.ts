import type {
  AiEvent,
  AiEventKind,
  AssistantStore,
  BillProposal,
  DocumentType,
  Draft,
  DraftKind,
  DraftStatus,
  Job,
  JobStatus,
  StoredDocument,
} from "@peni/core";
import type { Db } from "./db";
import type { AiDraft as DraftRow, AiEvent as EventRow, Job as JobRow, Prisma } from "./generated/client";

const toDraft = (r: DraftRow): Draft => ({
  ...r,
  kind: r.kind as DraftKind,
  status: r.status as DraftStatus,
  proposal: r.proposal as unknown as BillProposal,
});
const toJob = (r: JobRow): Job => ({
  ...r,
  status: r.status as JobStatus,
  payload: r.payload as Record<string, unknown>,
  result: (r.result as Record<string, unknown> | null) ?? null,
});
const toEvent = (r: EventRow): AiEvent => ({ ...r, kind: r.kind as AiEventKind });
const json = (v: unknown) => v as Prisma.InputJsonValue;

export class PrismaAssistantStore implements AssistantStore {
  constructor(private readonly db: Db) {}

  async saveDocument(doc: StoredDocument): Promise<void> {
    const { id, ...rest } = doc;
    const data = { ...rest, bytes: Buffer.from(rest.bytes) };
    await this.db().cafeDocument.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  async getDocument(cafeId: string, id: string): Promise<StoredDocument | null> {
    const r = await this.db().cafeDocument.findFirst({ where: { id, cafeId } });
    return r ? { ...r, contentType: r.contentType as DocumentType, bytes: new Uint8Array(r.bytes) } : null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    const data = { ...draft, proposal: json(draft.proposal) };
    await this.db().aiDraft.upsert({ where: { id: draft.id }, create: data, update: data });
  }

  async getDraft(cafeId: string, id: string): Promise<Draft | null> {
    const r = await this.db().aiDraft.findFirst({ where: { id, cafeId } });
    return r ? toDraft(r) : null;
  }

  async listDrafts(cafeId: string, opts: { status?: DraftStatus; limit: number }): Promise<Draft[]> {
    const rows = await this.db().aiDraft.findMany({
      where: { cafeId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toDraft);
  }

  async countOpenDrafts(cafeId: string): Promise<number> {
    return this.db().aiDraft.count({ where: { cafeId, status: "open" } });
  }

  async addJob(job: Job): Promise<void> {
    await this.db().job.create({ data: { ...job, payload: json(job.payload), result: job.result === null ? undefined : json(job.result) } });
  }

  async saveJob(job: Job): Promise<void> {
    const { id, ...rest } = job;
    await this.db().job.update({ where: { id }, data: { ...rest, payload: json(rest.payload), result: rest.result === null ? undefined : json(rest.result) } });
  }

  async getJob(id: string): Promise<Job | null> {
    const r = await this.db().job.findUnique({ where: { id } });
    return r ? toJob(r) : null;
  }

  async claimJobs(now: Date, limit: number, lockedUntil: Date): Promise<Job[]> {
    // SKIP LOCKED: two passes at once (the cron and a page) each take different jobs.
    const rows = await this.db().$queryRaw<JobRow[]>`
      UPDATE "Job" SET "status" = 'running', "attempts" = "attempts" + 1, "lockedUntil" = ${lockedUntil}
      WHERE "id" IN (
        SELECT "id" FROM "Job"
        WHERE ("status" = 'queued' AND "runAt" <= ${now}) OR ("status" = 'running' AND "lockedUntil" <= ${now})
        ORDER BY "runAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    return rows.map(toJob).sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
  }

  async listJobs(cafeId: string, opts: { kinds: string[]; since: Date }): Promise<Job[]> {
    const rows = await this.db().job.findMany({ where: { cafeId, kind: { in: opts.kinds }, createdAt: { gte: opts.since } }, orderBy: { createdAt: "desc" } });
    return rows.map(toJob);
  }

  async addEvent(event: AiEvent): Promise<void> {
    await this.db().aiEvent.create({ data: event });
  }

  async listEvents(cafeId: string, opts: { limit: number; before?: Date }): Promise<AiEvent[]> {
    const rows = await this.db().aiEvent.findMany({
      where: { cafeId, ...(opts.before ? { at: { lt: opts.before } } : {}) },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toEvent);
  }

  async usage(cafeId: string, from: Date, to: Date) {
    const r = await this.db().aiEvent.aggregate({
      where: { cafeId, kind: "ai.call", at: { gte: from, lt: to } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true },
    });
    return { calls: r._count._all, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0 };
  }
}
