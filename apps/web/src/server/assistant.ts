import { billReadingRequest, isAiError, readBill, ScriptedModel, type AiModel, type BillReading, type ReadBill } from "@peni/ai";
import type { AiLogDTO, BillProposalDTO, DraftDTO, DraftsDTO, ReadingDTO } from "@peni/api";
import {
  DOCUMENT_NAME_MAX,
  MAX_DOCUMENT_BYTES,
  localDateKey,
  sniffDocumentType,
  startOfLocalDay,
  type AiEvent,
  type AssistantStore,
  type BillProposal,
  type BillStore,
  type Draft,
  type Job,
  type PeniDirectory,
  type Permission,
  type StaffStore,
  type Supplier,
} from "@peni/core";
import { formatTL, trLower } from "@peni/brand/format";
import { createHash, randomUUID } from "node:crypto";
import type { BillInput, BillService } from "./bills";
import { AppError } from "./errors";
import type { JobHandler, JobRunner } from "./jobs";
import type { StaffContext } from "./staff";

/** Whether the assistant can read: with an OpenAI key, with the demo's stand-in, or not at all. */
export type AiMode = "on" | "demo" | "off";

const READ = "document.read";
/** Readings show on Taslaklar for a day; after that, the log has them. */
const READING_SHOWN_MS = 24 * 3_600_000;
const RECENT_DRAFTS = 20;
const LOG_PAGE = 50;

/**
 * The assistant's ground floor (plan piece 24): documents in, drafts out, a person
 * confirms (D21). A photo or PDF is stored, a job reads it with the model, and what was
 * read becomes a draft bill. Confirming adds the bill in the confirmer's name, through
 * Faturalar's own rules; dismissing keeps the draft for the log. Every call to the model
 * and every decision is logged.
 */
export class AssistantService {
  constructor(
    private readonly store: AssistantStore,
    private readonly jobs: JobRunner,
    private readonly bills: BillService,
    private readonly billStore: BillStore,
    private readonly staff: StaffStore,
    private readonly directory: PeniDirectory,
    private readonly ai: { model: AiModel | null; mode: AiMode },
    private readonly now: () => Date,
  ) {
    jobs.handle(READ, this.read);
  }

  get mode(): AiMode {
    return this.ai.mode;
  }

  /** A photo or PDF of a bill. It's read in the background; the draft shows up on Taslaklar. */
  async upload(ctx: StaffContext, bytes: Uint8Array, name: string): Promise<ReadingDTO> {
    this.require(ctx, "bills.add");
    if (!this.ai.model) throw new AppError("AI_OFF", "The assistant is off", 409);
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new AppError("DOCUMENT_TOO_LARGE", "Documents can be at most 10 MB", 413);
    const contentType = sniffDocumentType(bytes);
    if (!contentType) throw new AppError("DOCUMENT_TYPE", "Send a photo or a PDF", 415);
    const now = this.now();
    const doc = {
      id: `doc_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      name: name.trim().slice(0, DOCUMENT_NAME_MAX),
      contentType,
      bytes,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedBy: ctx.member.id,
      createdAt: now,
    };
    await this.store.saveDocument(doc);
    const job = await this.jobs.add(ctx.cafe.id, READ, { documentId: doc.id, by: ctx.member.id });
    await this.record({ cafeId: ctx.cafe.id, kind: "document.uploaded", memberId: ctx.member.id, documentId: doc.id, jobId: job.id, detail: doc.name || null });
    return this.reading(job, doc.name);
  }

  /** Runs what's waiting. Routes call it after answering, so the person never waits on it. */
  runSoon(): Promise<number> {
    return this.jobs.runDue(5);
  }

  async list(ctx: StaffContext): Promise<DraftsDTO> {
    this.require(ctx, "assistant.use");
    const cafeId = ctx.cafe.id;
    const [open, decided, jobs, billForm, today] = await Promise.all([
      this.store.listDrafts(cafeId, { status: "open", limit: 100 }),
      this.store.listDrafts(cafeId, { limit: RECENT_DRAFTS + 100 }),
      this.store.listJobs(cafeId, { kinds: [READ], since: new Date(this.now().getTime() - READING_SHOWN_MS) }),
      this.bills.list(ctx),
      this.today(cafeId),
    ]);
    const recent = decided.filter((d) => d.status !== "open").slice(0, RECENT_DRAFTS);
    const names = await this.names([...recent.map((d) => d.decidedById ?? "")]);
    // A draft is saved just before its job is marked done; don't show it as still reading.
    const written = new Set(decided.map((d) => d.jobId));
    const reading: ReadingDTO[] = [];
    for (const job of jobs) {
      if ((job.status === "done" && !job.result?.notBill) || written.has(job.id)) continue;
      const doc = await this.store.getDocument(cafeId, String(job.payload.documentId));
      reading.push(this.reading(job, doc?.name ?? ""));
    }
    return {
      cafe: { slug: ctx.cafe.slug, name: ctx.cafe.name },
      today,
      open: await Promise.all(open.map((d) => this.dto(ctx, d, names))),
      recent: await Promise.all(recent.map((d) => this.dto(ctx, d, names))),
      reading,
      ai: this.ai.mode,
      canUpload: ctx.permissions.has("bills.add") && this.ai.model !== null,
      canConfirm: ctx.permissions.has("bills.add"),
      billForm,
    };
  }

  /** "Onayla": the bill as the person checked it, added in their name. Confirming twice adds it once. */
  async confirm(ctx: StaffContext, draftId: string, input: BillInput): Promise<DraftDTO> {
    this.require(ctx, "assistant.use");
    this.require(ctx, "bills.add");
    const draft = await this.draft(ctx, draftId);
    if (draft.status === "dismissed") throw new AppError("DRAFT_DECIDED", "This draft was dismissed", 409);
    // The draft's id is the bill's key: a second confirm finds the same bill.
    const bill = await this.bills.add(ctx, { ...input, key: draft.id });
    if (draft.status === "open") {
      const changed = changedFields(draft.proposal, input);
      Object.assign(draft, { status: "confirmed", decidedById: ctx.member.id, decidedAt: this.now(), resultId: bill.id, changed });
      await this.store.saveDraft(draft);
      await this.record({
        cafeId: draft.cafeId,
        kind: "draft.confirmed",
        memberId: ctx.member.id,
        draftId: draft.id,
        documentId: draft.documentId,
        detail: changed.join(", ") || null,
      });
    }
    return this.dto(ctx, draft);
  }

  async dismiss(ctx: StaffContext, draftId: string, input: { reason?: string | null }): Promise<DraftDTO> {
    this.require(ctx, "assistant.use");
    const draft = await this.draft(ctx, draftId);
    if (draft.status === "confirmed") throw new AppError("DRAFT_DECIDED", "This draft was already confirmed", 409);
    if (draft.status === "open") {
      Object.assign(draft, { status: "dismissed", decidedById: ctx.member.id, decidedAt: this.now(), dismissReason: input.reason?.trim() || null });
      await this.store.saveDraft(draft);
      await this.record({
        cafeId: draft.cafeId,
        kind: "draft.dismissed",
        memberId: ctx.member.id,
        draftId: draft.id,
        documentId: draft.documentId,
        detail: draft.dismissReason,
      });
    }
    return this.dto(ctx, draft);
  }

  /** "Kayıt": what the assistant did and what people did with it, newest first. */
  async log(ctx: StaffContext, before?: string): Promise<AiLogDTO> {
    this.require(ctx, "assistant.use");
    const at = before ? new Date(before) : undefined;
    if (at && Number.isNaN(at.getTime())) throw new AppError("VALIDATION", "Check the date", 400);
    const cafeId = ctx.cafe.id;
    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    const monthStart = startOfLocalDay(new Date(`${localDateKey(this.now(), tz).slice(0, 7)}-01T12:00:00Z`), tz);
    const [events, month] = await Promise.all([
      this.store.listEvents(cafeId, { limit: LOG_PAGE + 1, before: at }),
      this.store.usage(cafeId, monthStart, new Date(this.now().getTime() + 1)),
    ]);
    const page = events.slice(0, LOG_PAGE);
    const names = await this.names(page.map((e) => e.memberId ?? ""));
    return {
      events: page.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        kind: e.kind,
        who: e.memberId ? (names.get(e.memberId) ?? null) : null,
        purpose: e.purpose,
        model: e.model,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        ms: e.ms,
        ok: e.ok,
        detail: e.detail,
        draftId: e.draftId,
      })),
      month,
      next: events.length > LOG_PAGE ? page.at(-1)!.at.toISOString() : null,
    };
  }

  private async record(event: Partial<AiEvent> & Pick<AiEvent, "cafeId" | "kind">): Promise<void> {
    await this.store.addEvent({
      id: eventId(),
      at: this.now(),
      memberId: null,
      purpose: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: null,
      ok: true,
      detail: null,
      draftId: null,
      documentId: null,
      jobId: null,
      ...event,
    });
  }

  /** A document's bytes, for the staff who can see drafts or bills. */
  async document(ctx: StaffContext, id: string) {
    if (!ctx.permissions.has("assistant.use")) this.require(ctx, "bills.view");
    const doc = await this.store.getDocument(ctx.cafe.id, id);
    if (!doc) throw new AppError("DOCUMENT_NOT_FOUND", "No such document", 404);
    return doc;
  }

  /** How many drafts wait, for Bugün. */
  countOpen(cafeId: string): Promise<number> {
    return this.store.countOpenDrafts(cafeId);
  }

  async openTitles(cafeId: string, limit: number): Promise<string[]> {
    return (await this.store.listDrafts(cafeId, { status: "open", limit })).map((d) => d.title);
  }

  // ─────────────────────────────────────────────── the reading job

  private read: JobHandler = async (job: Job) => {
    const cafeId = job.cafeId;
    const documentId = String(job.payload.documentId);
    const by = typeof job.payload.by === "string" ? job.payload.by : null;
    const model = this.ai.model;
    if (!model) return { error: "AI_OFF", retry: false };
    const doc = await this.store.getDocument(cafeId, documentId);
    if (!doc) return { error: "DOCUMENT_NOT_FOUND", retry: false };

    const started = Date.now();
    let reading: BillReading;
    try {
      const r = await model.run(billReadingRequest(doc));
      reading = r.output;
      await this.record({
        cafeId,
        kind: "ai.call",
        memberId: by,
        purpose: READ,
        model: r.model,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        ms: r.ms,
        documentId,
        jobId: job.id,
      });
    } catch (error) {
      const usage = isAiError(error) ? error.usage : undefined;
      const message = error instanceof Error ? error.message : String(error);
      await this.record({
        cafeId,
        kind: "ai.call",
        memberId: by,
        purpose: READ,
        model: model.name,
        ...usage,
        ms: Date.now() - started,
        ok: false,
        detail: message.slice(0, 300),
        documentId,
        jobId: job.id,
      });
      return { error: isAiError(error) ? `${error.code}: ${message}` : message, retry: isAiError(error) ? error.retry : true };
    }
    if (!reading.isBill) return { result: { notBill: true } };

    const read = readBill(reading);
    const proposal = await this.propose(cafeId, read);
    const draft: Draft = {
      id: `drf_${randomUUID()}`,
      cafeId,
      kind: "bill",
      status: "open",
      title: titleOf(proposal, read),
      proposal,
      doubts: read.doubts,
      documentId,
      jobId: job.id,
      createdAt: this.now(),
      decidedById: null,
      decidedAt: null,
      resultId: null,
      changed: [],
      dismissReason: null,
    };
    await this.store.saveDraft(draft);
    await this.record({ cafeId, kind: "draft.created", memberId: by, purpose: READ, draftId: draft.id, documentId, jobId: job.id, detail: draft.title });
    return { result: { draftId: draft.id } };
  };

  /** What was read, as a bill for this café: a known supplier when the name or tax number matches. */
  private async propose(cafeId: string, read: ReadBill): Promise<BillProposal> {
    const supplier = matchSupplier(await this.billStore.listSuppliers(cafeId), read.supplierName, read.supplierTaxNumber);
    return {
      supplierId: supplier?.id ?? null,
      supplierName: read.supplierName,
      supplierTaxNumber: read.supplierTaxNumber,
      number: read.number,
      date: read.date,
      dueDate: read.dueDate,
      totalKurus: read.totalKurus,
      // Matching lines to stock items is piece 25 (A2); until then every line is an expense line.
      lines: read.lines.map((l) => ({ itemId: null, name: l.name, category: l.category, qtyMilli: null, totalKurus: l.totalKurus })),
    };
  }

  // ─────────────────────────────────────────────── helpers

  private reading(job: Job, documentName: string): ReadingDTO {
    const state = job.status === "failed" ? "failed" : job.result?.notBill ? "notBill" : "reading";
    return { jobId: job.id, documentName, at: job.createdAt.toISOString(), state, error: state === "failed" ? friendlyError(job.lastError) : null };
  }

  private async draft(ctx: StaffContext, id: string): Promise<Draft> {
    const d = await this.store.getDraft(ctx.cafe.id, id);
    if (!d) throw new AppError("DRAFT_NOT_FOUND", "No such draft", 404);
    return d;
  }

  private async dto(ctx: StaffContext, d: Draft, names?: Map<string, string>): Promise<DraftDTO> {
    const doc = d.documentId ? await this.store.getDocument(d.cafeId, d.documentId) : null;
    const who = d.decidedById ? ((names ?? (await this.names([d.decidedById]))).get(d.decidedById) ?? null) : null;
    return {
      id: d.id,
      kind: d.kind,
      status: d.status,
      title: d.title,
      createdAt: d.createdAt.toISOString(),
      proposal: d.proposal as BillProposalDTO,
      doubts: d.doubts,
      document: doc
        ? {
            id: doc.id,
            name: doc.name,
            contentType: doc.contentType,
            size: doc.size,
            url: `/api/v1/staff/${encodeURIComponent(ctx.cafe.slug)}/documents/${doc.id}`,
          }
        : null,
      decidedBy: who,
      decidedAt: d.decidedAt?.toISOString() ?? null,
      resultId: d.resultId,
      changed: d.changed,
      dismissReason: d.dismissReason,
    };
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids.filter(Boolean))) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    throw ctx.rolePermissions.has(permission)
      ? new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403)
      : new AppError("FORBIDDEN", "Not allowed", 403);
  }
}

let eventSeq = 0;
/** Ids that sort in the order the events happened, even within one millisecond: the log's tie-breaker. */
export function eventId(): string {
  eventSeq = (eventSeq + 1) % 1_679_616;
  return `aie_${Date.now().toString(36).padStart(9, "0")}${eventSeq.toString(36).padStart(4, "0")}_${randomUUID().slice(0, 8)}`;
}

/** "Moda Süt Ürünleri Ltd. Şti." and "Moda Süt" are the same seller; so are two equal tax numbers. */
export function matchSupplier(suppliers: Supplier[], name: string | null, taxNo: string | null): Supplier | null {
  const live = suppliers.filter((s) => !s.archivedAt);
  const digits = taxNo?.replace(/\D/g, "") ?? "";
  if (digits.length >= 10) {
    const byTax = live.find((s) => s.taxNo === digits);
    if (byTax) return byTax;
  }
  const read = plain(name ?? "");
  if (read.length < 3) return null;
  const hits = live.filter((s) => {
    const known = plain(s.name);
    return known.length >= 3 && (read.includes(known) || known.includes(read));
  });
  // The longest name that fits is the closest; two equally good ones is a guess, so none.
  hits.sort((a, b) => plain(b.name).length - plain(a.name).length);
  return hits.length === 1 || (hits.length > 1 && plain(hits[0]!.name).length > plain(hits[1]!.name).length) ? hits[0]! : null;
}

const COMPANY_WORDS = /\b(ltd|şti|sti|a\.?ş|aş|as|tic|san|ve|gıda|gida|limited|şirketi|sirketi)\b\.?/g;
const plain = (s: string) =>
  trLower(s)
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(COMPANY_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();

function titleOf(p: BillProposal, read: ReadBill): string {
  const total = p.totalKurus ?? read.lines.reduce((s, l) => s + l.totalKurus, 0);
  return [p.supplierName ?? "Fatura", total ? formatTL(total) : null].filter(Boolean).join(" · ").slice(0, 120);
}

/** Which parts of the bill the person changed before confirming, for the log. */
function changedFields(p: BillProposal, input: BillInput): string[] {
  const out: string[] = [];
  if ((p.supplierId ?? null) !== (input.supplierId ?? null)) out.push("supplier");
  if ((p.date ?? null) !== input.date) out.push("date");
  if ((p.number ?? null) !== (input.number ?? null)) out.push("number");
  if ((p.dueDate ?? null) !== (input.dueDate ?? null)) out.push("dueDate");
  const line = (l: { itemId: string | null; name?: string; category?: string; qtyMilli?: number | null; totalKurus: number }) =>
    [l.itemId ?? "", l.itemId ? "" : (l.name ?? ""), l.itemId ? "" : (l.category ?? ""), l.qtyMilli ?? "", l.totalKurus].join("|");
  if (p.lines.map(line).join("\n") !== input.lines.map(line).join("\n")) out.push("lines");
  return out;
}

function friendlyError(error: string | null): string {
  if (error?.startsWith("AI_UNAVAILABLE")) return "Asistana şu an ulaşılamadı.";
  if (error?.startsWith("AI_OFF")) return "Asistan kapalı.";
  if (error?.startsWith("AI_REJECTED")) return "Asistan bu belgeyi kabul etmedi.";
  return "Belge okunamadı.";
}

/**
 * The demo's stand-in for OpenAI: it doesn't look at the document, it answers with a
 * made-up packaging bill so Taslaklar can be tried without a key.
 */
export function demoModel(today: () => string): AiModel {
  return new ScriptedModel(
    (request) =>
      request.purpose === READ
        ? ({
            isBill: true,
            supplierName: "Ambalaj Dünyası Tic. Ltd. Şti.",
            supplierTaxNumber: null,
            number: "A-20511",
            date: today(),
            dueDate: null,
            total: 1810,
            lines: [
              { name: "Karton bardak 8 oz", quantity: 1000, unit: "adet", total: 1450, category: "supplies" },
              { name: "Peçete", quantity: 20, unit: "adet", total: 360, category: "supplies" },
            ],
            doubts: ["Demo: belge gerçekten okunmadı, bu örnek bir okuma."],
          } satisfies BillReading)
        : {},
    "demo",
  );
}
