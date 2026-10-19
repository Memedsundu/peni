import type {
  AiEvent,
  AiEventKind,
  AssistantStore,
  BillProposal,
  CafeInbox,
  DocumentType,
  Draft,
  DraftKind,
  DraftStatus,
  DuplicateRef,
  InboundEmail,
  Job,
  JobStatus,
  LineMatch,
  StoredDocument,
} from "@peni/core";
import type { Db } from "./db";
import { Prisma, type AiDraft as DraftRow, type AiEvent as EventRow, type InboundEmail as EmailRow, type Job as JobRow } from "./generated/client";

const toDraft = (r: DraftRow): Draft => ({
  ...r,
  kind: r.kind as DraftKind,
  status: r.status as DraftStatus,
  proposal: r.proposal as unknown as BillProposal,
  duplicateOf: (r.duplicateOf as unknown as DuplicateRef | null) ?? null,
});
const toJob = (r: JobRow): Job => ({
  ...r,
  status: r.status as JobStatus,
  payload: r.payload as Record<string, unknown>,
  result: (r.result as Record<string, unknown> | null) ?? null,
});
const toEvent = (r: EventRow): AiEvent => ({ ...r, kind: r.kind as AiEventKind });
const toEmail = (r: EmailRow): InboundEmail => ({
  ...r,
  documents: r.documents as unknown as InboundEmail["documents"],
  skipped: r.skipped as unknown as InboundEmail["skipped"],
});
const json = (v: unknown) => v as Prisma.InputJsonValue;
/** Everything about a document but its bytes. */
const INFO = {
  id: true,
  cafeId: true,
  name: true,
  contentType: true,
  size: true,
  sha256: true,
  uploadedBy: true,
  emailId: true,
  sender: true,
  createdAt: true,
} as const;

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

  async getDocumentInfo(cafeId: string, id: string): Promise<Omit<StoredDocument, "bytes"> | null> {
    const r = await this.db().cafeDocument.findFirst({ where: { id, cafeId }, select: INFO });
    return r ? { ...r, contentType: r.contentType as DocumentType } : null;
  }

  async findDocuments(cafeId: string, sha256: string): Promise<Omit<StoredDocument, "bytes">[]> {
    const rows = await this.db().cafeDocument.findMany({ where: { cafeId, sha256 }, orderBy: { createdAt: "desc" }, select: INFO });
    return rows.map((r) => ({ ...r, contentType: r.contentType as DocumentType }));
  }

  async saveDraft(draft: Draft): Promise<void> {
    const data = { ...draft, proposal: json(draft.proposal), duplicateOf: draft.duplicateOf ? json(draft.duplicateOf) : Prisma.DbNull };
    await this.db().aiDraft.upsert({ where: { id: draft.id }, create: data, update: data });
  }

  async getDraft(cafeId: string, id: string): Promise<Draft | null> {
    const r = await this.db().aiDraft.findFirst({ where: { id, cafeId } });
    return r ? toDraft(r) : null;
  }

  async getDraftByDocument(cafeId: string, documentId: string): Promise<Draft | null> {
    const r = await this.db().aiDraft.findFirst({ where: { cafeId, documentId }, orderBy: { createdAt: "desc" } });
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

  async listLineMatches(cafeId: string): Promise<LineMatch[]> {
    const rows = await this.db().aiLineMatch.findMany({ where: { cafeId } });
    return rows.map(({ supplierKey, ...r }) => ({ ...r, supplierId: supplierKey || null }));
  }

  async saveLineMatch(match: LineMatch): Promise<void> {
    const { supplierId, ...rest } = match;
    const data = { ...rest, supplierKey: supplierId ?? "" };
    await this.db().aiLineMatch.upsert({
      where: { cafeId_supplierKey_readKey: { cafeId: match.cafeId, supplierKey: data.supplierKey, readKey: match.readKey } },
      create: data,
      update: data,
    });
  }

  async deleteLineMatch(cafeId: string, supplierId: string | null, readKey: string): Promise<void> {
    await this.db().aiLineMatch.deleteMany({ where: { cafeId, supplierKey: supplierId ?? "", readKey } });
  }

  async getInbox(cafeId: string): Promise<CafeInbox | null> {
    return this.db().cafeInbox.findUnique({ where: { cafeId } });
  }

  async findInbox(token: string): Promise<CafeInbox | null> {
    return this.db().cafeInbox.findUnique({ where: { token } });
  }

  async saveInbox(inbox: CafeInbox): Promise<void> {
    await this.db().cafeInbox.upsert({ where: { cafeId: inbox.cafeId }, create: inbox, update: inbox });
  }

  async addInboundEmail(email: InboundEmail): Promise<boolean> {
    // The unique (café, provider id) decides when the same email is delivered twice at once.
    const r = await this.db().inboundEmail.createMany({
      data: [{ ...email, documents: json(email.documents), skipped: json(email.skipped) }],
      skipDuplicates: true,
    });
    return r.count === 1;
  }

  async saveInboundEmail(email: InboundEmail): Promise<void> {
    const { id, ...rest } = email;
    await this.db().inboundEmail.update({ where: { id }, data: { ...rest, documents: json(rest.documents), skipped: json(rest.skipped) } });
  }

  async findInboundEmail(cafeId: string, providerId: string): Promise<InboundEmail | null> {
    const r = await this.db().inboundEmail.findUnique({ where: { cafeId_providerId: { cafeId, providerId } } });
    return r ? toEmail(r) : null;
  }

  async listInboundEmails(cafeId: string, opts: { limit: number; since?: Date }): Promise<InboundEmail[]> {
    const rows = await this.db().inboundEmail.findMany({
      where: { cafeId, ...(opts.since ? { receivedAt: { gte: opts.since } } : {}) },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: opts.limit,
    });
    return rows.map(toEmail);
  }
}
