import {
  billReadingRequest,
  isAiError,
  quickReadingRequest,
  readBill,
  readQuick,
  readStatement,
  readZ,
  ScriptedModel,
  ScriptedTranscriber,
  statementReadingRequest,
  TURKISH_WEEKDAYS,
  zReadingRequest,
  type AiModel,
  type AiRequest,
  type BillReading,
  type QuickReading,
  type ReadBill,
  type StatementReading,
  type Transcriber,
  type ZReading,
} from "@peni/ai";
import type { AiLogDTO, BillDraftDTO, BillProposalDTO, DraftDTO, DraftsDTO, HeardDTO, ReadingDTO, UploadDTO, UploadsDTO } from "@peni/api";
import {
  AUDIO_SECONDS_MAX,
  DOCUMENT_NAME_MAX,
  MAX_AUDIO_BYTES,
  MAX_DOCUMENT_BYTES,
  QUICK_DRAFTS_MAX,
  QUICK_PER_DAY,
  QUICK_TEXT_MAX,
  billNumberKey,
  isSheet,
  lineKey,
  localDateKey,
  sniffAudioType,
  sniffDocumentType,
  startOfLocalDay,
  type AiEvent,
  type AssistantStore,
  type BillDraft,
  type BillProposal,
  type BillStore,
  type CheckOutcome,
  type Draft,
  type DocumentType,
  type DuplicateRef,
  type Job,
  type LineMatch,
  type PeniDirectory,
  type Permission,
  type ProposalLine,
  type QuickEntry,
  type StaffStore,
  type StatementAccount,
  type StockItem,
  type StoredDocument,
  type StockStore,
  type Supplier,
} from "@peni/core";
import { formatTL, trLower } from "@peni/brand/format";
import { createHash, randomUUID } from "node:crypto";
import type { BillInput, BillService } from "./bills";
import { outcomeDto, type ChecksService } from "./checks";
import { AppError } from "./errors";
import type { JobHandler, JobOutcome, JobRunner } from "./jobs";
import { sheetRows } from "./sheet";
import type { StaffContext } from "./staff";

/** Whether the assistant can read: with an OpenAI key, with the demo's stand-in, or not at all. */
export type AiMode = "on" | "demo" | "off";

const READ = "document.read";
/** Reading a quick entry (piece 28). */
const NOTE = "note.read";
/** Readings show on Taslaklar for a day; after that, the log has them. */
const READING_SHOWN_MS = 24 * 3_600_000;
const RECENT_DRAFTS = 20;
const LOG_PAGE = 50;
/** The most stock items the model is shown to match lines against. */
const STOCK_SHOWN = 300;
/** The most suppliers a quick entry is matched against (piece 28). */
const SUPPLIERS_SHOWN = 200;
/** Two bills from one supplier on one day whose totals are this close look like one bill. */
const SAME_TOTAL_KURUS = 100;

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
    private readonly stock: StockStore,
    private readonly staff: StaffStore,
    private readonly directory: PeniDirectory,
    private readonly checks: ChecksService,
    private readonly ai: { model: AiModel | null; mode: AiMode; transcriber?: Transcriber | null },
    private readonly now: () => Date,
  ) {
    jobs.handle(READ, this.read);
    jobs.handle(NOTE, this.readNote);
  }

  get mode(): AiMode {
    return this.ai.mode;
  }

  /**
   * A photo or PDF of a bill. It's read in the background; the draft shows up on Taslaklar.
   * The same file again (piece 25) isn't read twice: the answer says what became of it,
   * unless `again` asks for another reading.
   */
  async upload(ctx: StaffContext, bytes: Uint8Array, name: string, opts: { again?: boolean } = {}): Promise<UploadDTO> {
    this.require(ctx, "bills.add");
    if (!this.ai.model) throw new AppError("AI_OFF", "The assistant is off", 409);
    if (bytes.length > MAX_DOCUMENT_BYTES) throw new AppError("DOCUMENT_TOO_LARGE", "Documents can be at most 10 MB", 413);
    const contentType = sniffDocumentType(bytes);
    if (!contentType) throw new AppError("DOCUMENT_TYPE", "Send a photo, a PDF, an Excel file or a CSV", 415);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (!opts.again) {
      const duplicate = await this.sameFile(ctx.cafe.id, sha256);
      if (duplicate) return { reading: null, duplicate };
    }
    const { doc, job } = await this.intake(ctx.cafe.id, { bytes, name, contentType, sha256 }, { by: ctx.member.id, emailId: null, sender: null });
    return { reading: this.reading(job, doc.name), duplicate: null };
  }

  /**
   * A file from an email that reached the café's address (piece 26): read like an upload,
   * with the sender kept for the draft. Anything but a photo, PDF or statement spreadsheet, anything too large,
   * and a file the café already sent in are left, with the reason.
   */
  async fromEmail(
    cafeId: string,
    file: { bytes: Uint8Array; name: string },
    email: { id: string; sender: string },
  ): Promise<{ documentId: string } | { skipped: "type" | "large" | "same" }> {
    if (file.bytes.length > MAX_DOCUMENT_BYTES) return { skipped: "large" };
    const contentType = sniffDocumentType(file.bytes);
    if (!contentType) return { skipped: "type" };
    const sha256 = createHash("sha256").update(file.bytes).digest("hex");
    if (await this.sameFile(cafeId, sha256)) return { skipped: "same" };
    const { doc } = await this.intake(cafeId, { ...file, contentType, sha256 }, { by: null, emailId: email.id, sender: email.sender });
    return { documentId: doc.id };
  }

  /**
   * Quick entry (piece 28): "Tesisatçıya 450 lira nakit ödedim". Read in the background like
   * a document; each expense in it becomes a bill draft on Taslaklar. The same key twice
   * sends it once. A café may send QUICK_PER_DAY of them a day.
   */
  async quick(ctx: StaffContext, input: { key: string; text: string; voice?: boolean }): Promise<UploadDTO> {
    this.require(ctx, "bills.add");
    if (!this.ai.model) throw new AppError("AI_OFF", "The assistant is off", 409);
    const text = input.text.replace(/\s+/g, " ").trim().slice(0, QUICK_TEXT_MAX);
    if (!text) throw new AppError("VALIDATION", "Write something", 400);
    const cafeId = ctx.cafe.id;
    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    const today = startOfLocalDay(this.now(), tz);
    const sent = await this.store.listJobs(cafeId, { kinds: [NOTE], since: new Date(Math.min(today.getTime(), this.now().getTime() - READING_SHOWN_MS)) });
    const again = sent.find((j) => j.payload.key === input.key && j.payload.by === ctx.member.id);
    if (again) return { reading: this.reading(again, String(again.payload.text)), duplicate: null };
    if (sent.filter((j) => j.createdAt >= today).length >= QUICK_PER_DAY) throw new AppError("QUICK_LIMIT", "That's all the quick entries for today", 429);
    const job = await this.jobs.add(cafeId, NOTE, { text, voice: !!input.voice, by: ctx.member.id, key: input.key });
    await this.record({ cafeId, kind: "note.sent", memberId: ctx.member.id, jobId: job.id, detail: text.slice(0, 300) });
    return { reading: this.reading(job, text), duplicate: null };
  }

  /**
   * A short recording, turned into text for the person to read and fix before sending it
   * with `quick`. The recording isn't kept; the call is logged.
   */
  async hear(ctx: StaffContext, bytes: Uint8Array, lang: "tr" | "en"): Promise<HeardDTO> {
    this.require(ctx, "bills.add");
    const ears = this.ai.transcriber;
    if (!this.ai.model || !ears) throw new AppError("VOICE_OFF", "Speech isn't set up", 409);
    if (bytes.length > MAX_AUDIO_BYTES) throw new AppError("AUDIO_TOO_LARGE", `Speak for at most ${AUDIO_SECONDS_MAX} seconds`, 413);
    const contentType = sniffAudioType(bytes);
    if (!contentType) throw new AppError("AUDIO_TYPE", "That isn't a recording", 415);
    const cafeId = ctx.cafe.id;
    // Supplier names are hard to hear right; telling the model which ones the café has helps.
    const names = (await this.billStore.listSuppliers(cafeId)).map((s) => s.name).slice(0, 40);
    const base = { cafeId, kind: "ai.call" as const, memberId: ctx.member.id, purpose: "voice.hear" };
    const started = Date.now();
    try {
      const heard = await ears.transcribe({ bytes, contentType }, { language: lang, prompt: names.length ? `Tedarikçiler: ${names.join(", ")}.` : undefined });
      await this.record({ ...base, model: heard.model, inputTokens: heard.inputTokens, outputTokens: heard.outputTokens, ms: heard.ms });
      const text = heard.text.replace(/\s+/g, " ").trim().slice(0, QUICK_TEXT_MAX);
      if (!text) throw new AppError("VOICE_EMPTY", "Nothing was heard", 422);
      return { text };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.record({ ...base, model: ears.name, ms: Date.now() - started, ok: false, detail: message.slice(0, 300) });
      throw new AppError("VOICE_FAILED", "Speech couldn't be turned into text", 502);
    }
  }

  private async intake(
    cafeId: string,
    file: { bytes: Uint8Array; name: string; contentType: DocumentType; sha256: string },
    from: { by: string | null; emailId: string | null; sender: string | null },
  ) {
    const doc = {
      id: `doc_${randomUUID()}`,
      cafeId,
      name: file.name.trim().slice(0, DOCUMENT_NAME_MAX),
      contentType: file.contentType,
      bytes: file.bytes,
      size: file.bytes.length,
      sha256: file.sha256,
      uploadedBy: from.by ?? "",
      emailId: from.emailId,
      sender: from.sender,
      createdAt: this.now(),
    };
    await this.store.saveDocument(doc);
    const job = await this.jobs.add(cafeId, READ, { documentId: doc.id, by: from.by, ...(from.sender ? { sender: from.sender } : {}) });
    await this.record({ cafeId, kind: "document.uploaded", memberId: from.by, documentId: doc.id, jobId: job.id, detail: doc.name || null });
    return { doc, job };
  }

  /** An earlier upload of the same bytes that is still being read or became a draft nobody dismissed. */
  private async sameFile(cafeId: string, sha256: string): Promise<UploadDTO["duplicate"]> {
    for (const doc of await this.store.findDocuments(cafeId, sha256)) {
      const draft = await this.store.getDraftByDocument(cafeId, doc.id);
      const found = { at: doc.createdAt.toISOString(), name: doc.name };
      if (draft) {
        if (draft.status !== "dismissed") return { ...found, title: draft.title, draftId: draft.id, billId: draft.resultId };
        continue;
      }
      const job = (await this.store.listJobs(cafeId, { kinds: [READ], since: doc.createdAt })).find((j) => j.payload.documentId === doc.id);
      if (job && (job.status === "queued" || job.status === "running")) return { ...found, title: null, draftId: null, billId: null };
    }
    return null;
  }

  /**
   * What the viewer sent in the last day and what became of each: for the till and
   * Faturalar, where people who add bills but don't check drafts can see it arrived.
   */
  async mine(ctx: StaffContext): Promise<UploadsDTO> {
    this.require(ctx, "bills.add");
    const cafeId = ctx.cafe.id;
    const jobs = (await this.store.listJobs(cafeId, { kinds: [READ, NOTE], since: new Date(this.now().getTime() - READING_SHOWN_MS) }))
      .filter((j) => j.payload.by === ctx.member.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const uploads: UploadsDTO["uploads"] = [];
    for (const job of jobs) {
      const { name, draft } = await this.sentAs(cafeId, job);
      const base = this.reading(job, name);
      const state: UploadsDTO["uploads"][number]["state"] = draft
        ? draft.status === "open"
          ? "waiting"
          : draft.status === "confirmed"
            ? "saved"
            : "dismissed"
        : base.state;
      uploads.push({
        jobId: job.id,
        source: base.source,
        documentName: base.documentName,
        at: base.at,
        state,
        title: draft?.title ?? null,
        error: draft ? null : base.error,
      });
    }
    return { ai: this.ai.mode, canSpeak: this.canSpeak, uploads };
  }

  /** What a job was sent as (a document's name, or what was typed or said) and its first draft. */
  private async sentAs(cafeId: string, job: Job): Promise<{ name: string; draft: Draft | null }> {
    if (job.kind === NOTE) {
      const ids = Array.isArray(job.result?.draftIds) ? (job.result.draftIds as string[]) : [];
      return { name: String(job.payload.text ?? ""), draft: ids[0] ? await this.store.getDraft(cafeId, ids[0]) : null };
    }
    const documentId = String(job.payload.documentId);
    const [doc, draft] = await Promise.all([this.store.getDocumentInfo(cafeId, documentId), this.store.getDraftByDocument(cafeId, documentId)]);
    return { name: doc?.name ?? "", draft };
  }

  private get canSpeak(): boolean {
    return !!this.ai.model && !!this.ai.transcriber;
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
      this.store.listJobs(cafeId, { kinds: [READ, NOTE], since: new Date(this.now().getTime() - READING_SHOWN_MS) }),
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
      reading.push(this.reading(job, (await this.sentAs(cafeId, job)).name));
    }
    return {
      cafe: { slug: ctx.cafe.slug, name: ctx.cafe.name },
      today,
      // Two copies read at the same moment (an email with both, several files at once) don't
      // see each other when they're written; here the newer one is marked.
      open: await Promise.all(
        open.map((d, i) =>
          this.dto(ctx, d.kind === "bill" ? { ...d, duplicateOf: d.duplicateOf ?? sameBillAmong(d.proposal, open.slice(i + 1), d.id) } : d, names),
        ),
      ),
      recent: await Promise.all(recent.map((d) => this.dto(ctx, d, names))),
      reading,
      ai: this.ai.mode,
      canUpload: ctx.permissions.has("bills.add") && this.ai.model !== null,
      canConfirm: ctx.permissions.has("bills.add"),
      canCheck: ctx.permissions.has("cash.manage"),
      canSpeak: ctx.permissions.has("bills.add") && this.canSpeak,
      billForm,
    };
  }

  /**
   * "Onayla": the bill as the person checked it, added in their name, with the scan it came
   * from. Confirming twice adds it once. A bill that looks already entered needs
   * `allowDuplicate`. Each read line confirmed as a stock item (or unlinked from one) is
   * remembered for the next bill (piece 25). `paid` pays it in full as it's added, like
   * "Fatura ekle" (piece 28: a quick entry says how it was paid; the person confirms it).
   */
  async confirm(
    ctx: StaffContext,
    draftId: string,
    input: BillInput & { allowDuplicate?: boolean; paid?: { method: "cash" | "card" | "bank" | "credit"; from?: "drawer" | "reserve"; paidOn?: string } },
  ): Promise<BillDraftDTO> {
    this.require(ctx, "assistant.use");
    this.require(ctx, "bills.add");
    const draft = await this.draft(ctx, draftId);
    if (draft.kind !== "bill") throw new AppError("DRAFT_KIND", "This draft isn't a bill", 409);
    if (draft.status === "dismissed") throw new AppError("DRAFT_DECIDED", "This draft was dismissed", 409);
    if (draft.status === "open" && !input.allowDuplicate) {
      const total = input.lines.reduce((s, l) => s + l.totalKurus, 0);
      const earlier = await this.duplicateBill(
        ctx.cafe.id,
        { supplierId: input.supplierId, number: input.number ?? null, date: input.date, totalKurus: total },
        draft.id,
      );
      if (earlier) throw new AppError("BILL_DUPLICATE", "This bill looks already entered", 409);
    }
    // The draft's id is the bill's key: a second confirm finds the same bill.
    // Paid as the draft is confirmed: on the bill's own day unless said (a quick entry's "dün nakit ödedim").
    const { allowDuplicate, paid, ...fields } = input;
    const bill = await this.bills.add(ctx, {
      ...fields,
      lines: fields.lines.map(({ from: _from, ...l }) => l),
      key: draft.id,
      documentId: draft.documentId,
      ...(paid ? { paid: { paidOn: fields.date, ...paid } } : {}),
      allowDuplicate: allowDuplicate || draft.status !== "open",
    });
    if (draft.status === "open") {
      await this.learn(ctx.cafe.id, draft.proposal, input);
      const changed = changedFields(draft.proposal, input, input.paid?.method ?? null);
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
    return (await this.dto(ctx, draft)) as BillDraftDTO;
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

  /**
   * "Kontrol edildi" on a statement or Z report (piece 27): what was seen is kept, and with
   * `fixBalance` Peni's bank balance is set to the statement's. Saying it twice keeps the first.
   */
  async check(ctx: StaffContext, draftId: string, input: { note?: string | null; fixBalance?: boolean }): Promise<DraftDTO> {
    this.require(ctx, "assistant.use");
    const draft = await this.draft(ctx, draftId);
    if (draft.kind === "bill") throw new AppError("DRAFT_KIND", "This draft is a bill", 409);
    if (draft.status === "dismissed") throw new AppError("DRAFT_DECIDED", "This draft was dismissed", 409);
    if (draft.status === "open") {
      const outcome = await this.checks.check(ctx, draft, input);
      Object.assign(draft, { status: "confirmed", decidedById: ctx.member.id, decidedAt: this.now(), outcome });
      await this.store.saveDraft(draft);
      await this.record({
        cafeId: draft.cafeId,
        kind: "draft.confirmed",
        memberId: ctx.member.id,
        draftId: draft.id,
        documentId: draft.documentId,
        detail: checkedDetail(draft.kind, outcome),
      });
    }
    return this.dto(ctx, draft);
  }

  /** Demo only: a sample bank or card statement, or a Z report, from the demo café's numbers, read like an upload. */
  async sample(ctx: StaffContext, kind: "bank" | "card" | "zreport"): Promise<UploadDTO> {
    this.require(ctx, "bills.add");
    if (this.ai.mode !== "demo") throw new AppError("CHECK_SAMPLE_DEMO", "Only the demo sends sample documents", 409);
    const file = await this.checks.sample(ctx.cafe.id, kind);
    return this.upload(ctx, file.bytes, file.name, { again: true });
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
    if (!this.ai.model) return { error: "AI_OFF", retry: false };
    const doc = await this.store.getDocument(cafeId, documentId);
    if (!doc) return { error: "DOCUMENT_NOT_FOUND", retry: false };

    // A spreadsheet is a statement: bills don't come as one (piece 27).
    if (isSheet(doc.contentType)) return this.readStatement(job, doc, by, null);

    const items = (await this.stock.listItems(cafeId))
      .filter((i) => !i.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      .slice(0, STOCK_SHOWN);
    const asked = await this.ask(job, by, billReadingRequest(doc, items));
    if ("error" in asked) return asked;
    const reading: BillReading = asked.output;
    if (reading.kind === "bankStatement" || reading.kind === "cardStatement")
      return this.readStatement(job, doc, by, reading.kind === "cardStatement" ? "card" : "bank");
    if (reading.kind === "zReport") return this.readZ(job, doc, by);
    if (reading.kind !== "bill") return { result: { notBill: true } };

    const read = readBill(reading, items.length);
    const sender = typeof job.payload.sender === "string" ? job.payload.sender : null;
    const { proposal, doubts } = await this.propose(cafeId, read, items, sender);
    const draft: BillDraft = {
      id: `drf_${randomUUID()}`,
      cafeId,
      kind: "bill",
      status: "open",
      title: titleOf(proposal, read),
      proposal,
      doubts: [...read.doubts, ...doubts],
      documentId,
      entry: null,
      jobId: job.id,
      createdAt: this.now(),
      decidedById: null,
      decidedAt: null,
      resultId: null,
      changed: [],
      dismissReason: null,
      duplicateOf: null,
      outcome: null,
    };
    draft.duplicateOf =
      (await this.duplicateBill(cafeId, { ...proposal, totalKurus: proposal.totalKurus ?? lineSum(proposal) }, draft.id)) ??
      (await this.duplicateDraft(cafeId, proposal, draft.id));
    await this.store.saveDraft(draft);
    await this.record({ cafeId, kind: "draft.created", memberId: by, purpose: READ, draftId: draft.id, documentId, jobId: job.id, detail: draft.title });
    return { result: { draftId: draft.id } };
  };

  /**
   * A quick entry (piece 28): the model is shown the café's suppliers and stock items and
   * picks out each expense; each becomes a bill draft with what was typed or said beside it.
   */
  private readNote: JobHandler = async (job: Job) => {
    const cafeId = job.cafeId;
    const by = typeof job.payload.by === "string" ? job.payload.by : null;
    const entry: QuickEntry = { text: String(job.payload.text ?? ""), voice: job.payload.voice === true };
    if (!this.ai.model) return { error: "AI_OFF", retry: false };
    const [items, suppliers, settings] = await Promise.all([
      this.stock.listItems(cafeId),
      this.billStore.listSuppliers(cafeId),
      this.directory.getSettings(cafeId),
    ]);
    const shown = items
      .filter((i) => !i.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name, "tr"))
      .slice(0, STOCK_SHOWN);
    const known = [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "tr")).slice(0, SUPPLIERS_SHOWN);
    const today = localDateKey(this.now(), settings.timeZone);
    const weekday = TURKISH_WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()]!;
    const asked = await this.ask(job, by, quickReadingRequest(entry, { today, weekday, suppliers: known, items: shown }));
    if ("error" in asked) return asked;
    const reading: QuickReading = asked.output;
    const read = readQuick(reading, { today, suppliers: known.length, items: shown.length, max: QUICK_DRAFTS_MAX });
    if (!read.expenses.length) return { result: { notBill: true, why: read.doubts[0] ?? null } };

    const draftIds: string[] = [];
    for (const expense of read.expenses) {
      // A supplier the model picked from the list is named as the café has it, so it's matched.
      const named = expense.supplierIndex !== null ? { ...expense, supplierName: known[expense.supplierIndex]!.name } : expense;
      const { proposal, doubts } = await this.propose(cafeId, named, shown, null);
      proposal.paid = expense.paid ? { method: expense.paid } : null;
      const draft: BillDraft = {
        id: `drf_${randomUUID()}`,
        cafeId,
        kind: "bill",
        status: "open",
        title: titleOf(proposal, named, proposal.lines[0]?.name),
        proposal,
        doubts: [...read.doubts, ...expense.doubts, ...doubts],
        documentId: null,
        entry,
        jobId: job.id,
        createdAt: this.now(),
        decidedById: null,
        decidedAt: null,
        resultId: null,
        changed: [],
        dismissReason: null,
        duplicateOf: null,
        outcome: null,
      };
      draft.duplicateOf =
        (await this.duplicateBill(cafeId, { ...proposal, totalKurus: lineSum(proposal) }, draft.id)) ?? (await this.duplicateDraft(cafeId, proposal, draft.id));
      await this.store.saveDraft(draft);
      await this.record({ cafeId, kind: "draft.created", memberId: by, purpose: NOTE, draftId: draft.id, jobId: job.id, detail: draft.title });
      draftIds.push(draft.id);
    }
    return { result: { draftIds } };
  };

  /**
   * Asks the model, and logs the call either way. Statements and Z reports in the demo are
   * answered by `demo` instead, from the café's own numbers.
   */
  private async ask<T>(
    job: Job,
    by: string | null,
    request: AiRequest<T>,
    demo?: () => Promise<T>,
  ): Promise<{ output: T } | { error: string; retry: boolean }> {
    const model = this.ai.model;
    if (!model) return { error: "AI_OFF", retry: false };
    const base = {
      cafeId: job.cafeId,
      kind: "ai.call" as const,
      memberId: by,
      purpose: request.purpose,
      documentId: typeof job.payload.documentId === "string" ? job.payload.documentId : null,
      jobId: job.id,
    };
    const started = Date.now();
    try {
      const r =
        this.ai.mode === "demo" && demo
          ? { output: await demo(), model: model.name, inputTokens: 0, outputTokens: 0, ms: Date.now() - started }
          : await model.run(request);
      await this.record({ ...base, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, ms: r.ms });
      return { output: r.output };
    } catch (error) {
      const usage = isAiError(error) ? error.usage : undefined;
      const message = error instanceof Error ? error.message : String(error);
      await this.record({ ...base, model: model.name, ...usage, ms: Date.now() - started, ok: false, detail: message.slice(0, 300) });
      return { error: isAiError(error) ? `${error.code}: ${message}` : message, retry: isAiError(error) ? error.retry : true };
    }
  }

  /** A bank or card statement (piece 27): its lines, matched against Peni whenever the draft is looked at. */
  private async readStatement(job: Job, doc: StoredDocument, by: string | null, account: StatementAccount | null): Promise<JobOutcome> {
    let request: AiRequest<StatementReading>;
    if (isSheet(doc.contentType)) {
      let rows: string[][];
      try {
        rows = sheetRows(doc.bytes, doc.contentType);
      } catch (e) {
        return { error: `SHEET_UNREADABLE: ${e instanceof Error ? e.message : String(e)}`, retry: false };
      }
      if (!rows.length) return { result: { notBill: true } };
      request = statementReadingRequest({ name: doc.name, rows });
    } else request = statementReadingRequest(doc);
    const guess = account ?? (/kart|card|kredi/i.test(doc.name) ? "card" : "bank");
    const asked = await this.ask(job, by, request, () => this.checks.demoStatement(job.cafeId, guess));
    if ("error" in asked) return asked;
    if (!asked.output.isStatement) return { result: { notBill: true } };
    const read = readStatement(asked.output);
    const proposal = this.checks.statementProposal(read);
    if (!read.lines.length) read.doubts.push("Ekstrede hiç satır okunamadı.");
    return this.saveCheckDraft(job, by, { kind: "statement", proposal, title: this.checks.statementTitle(proposal), doubts: read.doubts });
  }

  /** A Z report (piece 27), set beside the till's day whenever the draft is looked at. */
  private async readZ(job: Job, doc: StoredDocument, by: string | null): Promise<JobOutcome> {
    const asked = await this.ask<ZReading>(job, by, zReadingRequest(doc), () => this.checks.demoZ(job.cafeId));
    if ("error" in asked) return asked;
    if (!asked.output.isZReport) return { result: { notBill: true } };
    const read = readZ(asked.output);
    const proposal = this.checks.zProposal(read);
    return this.saveCheckDraft(job, by, { kind: "zreport", proposal, title: this.checks.zTitle(proposal), doubts: read.doubts });
  }

  private async saveCheckDraft(
    job: Job,
    by: string | null,
    d:
      | Pick<Extract<Draft, { kind: "statement" }>, "kind" | "proposal" | "title" | "doubts">
      | Pick<Extract<Draft, { kind: "zreport" }>, "kind" | "proposal" | "title" | "doubts">,
  ): Promise<JobOutcome> {
    const documentId = String(job.payload.documentId);
    const draft = {
      ...d,
      id: `drf_${randomUUID()}`,
      cafeId: job.cafeId,
      status: "open",
      documentId,
      entry: null,
      jobId: job.id,
      createdAt: this.now(),
      decidedById: null,
      decidedAt: null,
      resultId: null,
      changed: [],
      dismissReason: null,
      duplicateOf: null,
      outcome: null,
    } as Draft;
    draft.duplicateOf = await this.checks.duplicate(job.cafeId, d.kind, d.proposal, draft.id);
    await this.store.saveDraft(draft);
    await this.record({
      cafeId: job.cafeId,
      kind: "draft.created",
      memberId: by,
      purpose: READ,
      draftId: draft.id,
      documentId,
      jobId: job.id,
      detail: draft.title,
    });
    return { result: { draftId: draft.id } };
  }

  /**
   * What was read, as a bill for this café: a known supplier when the name or tax number
   * matches, and each line as the stock item a person confirmed it to be before, or the
   * one the model picked (piece 25). Anything that needs a second look becomes a doubt.
   */
  private async propose(cafeId: string, read: ReadBill, items: StockItem[], sender: string | null): Promise<{ proposal: BillProposal; doubts: string[] }> {
    const suppliers = await this.billStore.listSuppliers(cafeId);
    // A bill emailed from a supplier's own address is theirs when the name doesn't say (piece 26).
    const supplier = matchSupplier(suppliers, read.supplierName, read.supplierTaxNumber) ?? supplierByEmail(suppliers, sender);
    const learned = learnedMatches(await this.store.listLineMatches(cafeId), supplier?.id ?? null);
    const live = new Map(items.map((i) => [i.id, i]));
    const doubts: string[] = [];
    const used = new Set<string>();
    const lines: ProposalLine[] = read.lines.map((l) => {
      const printed = { readName: l.name, readQtyMilli: l.quantityMilli, readUnit: l.unit };
      const expense: ProposalLine = { itemId: null, name: l.name, category: l.category, qtyMilli: null, totalKurus: l.totalKurus, ...printed, matchedBy: null };
      const known = learned.get(lineKey(l.name));
      const picked = l.stockIndex !== null ? items[l.stockIndex] : undefined;
      const item = known ? live.get(known.itemId) : picked;
      if (!item) return expense;
      if (used.has(item.id)) {
        doubts.push(`"${l.name}" satırını stoğa bağlamadım: ${item.name} başka bir satırda var.`);
        return expense;
      }
      used.add(item.id);
      let qtyMilli = picked?.id === item.id ? l.stockQtyMilli : null;
      if (known?.perUnitMilli && l.quantityMilli) qtyMilli = Math.round((l.quantityMilli * known.perUnitMilli) / 1000);
      if (!qtyMilli || qtyMilli <= 0 || qtyMilli > 1_000_000_000) {
        qtyMilli = null;
        doubts.push(`${item.name} için gelen miktarı yaz.`);
      }
      return {
        itemId: item.id,
        name: item.name,
        category: item.kind === "supply" ? "supplies" : "ingredients",
        qtyMilli,
        totalKurus: l.totalKurus,
        ...printed,
        matchedBy: known ? "learned" : "model",
      };
    });
    return {
      proposal: {
        supplierId: supplier?.id ?? null,
        supplierName: read.supplierName,
        supplierTaxNumber: read.supplierTaxNumber,
        number: read.number,
        date: read.date,
        dueDate: read.dueDate,
        totalKurus: read.totalKurus,
        lines,
        kdv: read.kdv,
      },
      doubts,
    };
  }

  /** What the person confirmed each read line to be, kept for the supplier's next bill. */
  private async learn(
    cafeId: string,
    proposal: BillProposal,
    input: { supplierId: string | null; lines: { itemId: string | null; qtyMilli?: number | null; from?: number }[] },
  ) {
    for (const l of input.lines) {
      const read = l.from !== undefined ? proposal.lines[l.from] : undefined;
      if (!read?.readName) continue;
      const readKey = lineKey(read.readName);
      if (!readKey) continue;
      if (l.itemId) {
        const perUnitMilli = read.readQtyMilli && l.qtyMilli ? Math.round((l.qtyMilli * 1000) / read.readQtyMilli) : null;
        await this.store.saveLineMatch({ cafeId, supplierId: input.supplierId, readKey, itemId: l.itemId, perUnitMilli, updatedAt: this.now() });
      } else if (read.itemId) {
        // It was matched and the person said it isn't stock: stop matching it.
        await this.store.deleteLineMatch(cafeId, input.supplierId, readKey);
      }
    }
  }

  /**
   * A bill already entered that this looks like (piece 25): the same supplier and number,
   * or, when neither has a number, the same supplier, day and total. `except` is the
   * draft's own key, so its own bill never counts.
   */
  private async duplicateBill(
    cafeId: string,
    b: { supplierId: string | null; number: string | null; date: string | null; totalKurus: number },
    except: string,
  ): Promise<DuplicateRef | null> {
    if (!b.supplierId) return null;
    const bills = (await this.billStore.listBills(cafeId, { supplierId: b.supplierId })).filter((x) => !x.voidedAt && x.createKey !== except);
    const key = billNumberKey(b.number);
    const supplier = await this.billStore.getSupplier(cafeId, b.supplierId);
    const ref = (x: (typeof bills)[number], why: DuplicateRef["why"]): DuplicateRef => ({
      kind: "bill",
      id: x.id,
      title: [supplier?.name, x.number && `#${x.number}`, formatTL(x.totalKurus)].filter(Boolean).join(" · "),
      why,
    });
    const byNumber = key ? bills.find((x) => billNumberKey(x.number) === key) : undefined;
    if (byNumber) return ref(byNumber, "number");
    const byDay = b.date ? bills.find((x) => x.date === b.date && (!key || !x.number) && Math.abs(x.totalKurus - b.totalKurus) <= SAME_TOTAL_KURUS) : undefined;
    return byDay ? ref(byDay, "dayTotal") : null;
  }

  /** Another open draft of the same bill: two photos of one receipt. */
  private async duplicateDraft(cafeId: string, p: BillProposal, self: string): Promise<DuplicateRef | null> {
    return sameBillAmong(p, await this.store.listDrafts(cafeId, { status: "open", limit: 100 }), self);
  }

  // ─────────────────────────────────────────────── helpers

  private reading(job: Job, documentName: string): ReadingDTO {
    const state = job.status === "failed" ? "failed" : job.result?.notBill ? "notBill" : "reading";
    const source = job.kind === NOTE ? "note" : "document";
    const why = state === "failed" ? friendlyError(job.lastError, source) : state === "notBill" && typeof job.result?.why === "string" ? job.result.why : null;
    return { jobId: job.id, source, documentName, at: job.createdAt.toISOString(), state, error: why };
  }

  private async draft(ctx: StaffContext, id: string): Promise<Draft> {
    const d = await this.store.getDraft(ctx.cafe.id, id);
    if (!d) throw new AppError("DRAFT_NOT_FOUND", "No such draft", 404);
    return d;
  }

  private async dto(ctx: StaffContext, d: Draft, names?: Map<string, string>): Promise<DraftDTO> {
    const doc = d.documentId ? await this.store.getDocumentInfo(d.cafeId, d.documentId) : null;
    const who = d.decidedById ? ((names ?? (await this.names([d.decidedById]))).get(d.decidedById) ?? null) : null;
    const base = {
      id: d.id,
      status: d.status,
      title: d.title,
      createdAt: d.createdAt.toISOString(),
      doubts: d.doubts,
      document: doc
        ? {
            id: doc.id,
            name: doc.name,
            contentType: doc.contentType,
            size: doc.size,
            url: `/api/v1/staff/${encodeURIComponent(ctx.cafe.slug)}/documents/${doc.id}`,
            sender: doc.sender,
          }
        : null,
      entry: d.entry,
      decidedBy: who,
      decidedAt: d.decidedAt?.toISOString() ?? null,
      resultId: d.resultId,
      changed: d.changed,
      dismissReason: d.dismissReason,
      duplicateOf: d.duplicateOf,
    };
    // A statement or Z report is set beside Peni as it is now, while it waits to be checked.
    if (d.kind === "statement")
      return {
        ...base,
        kind: "statement",
        statement: d.status === "open" ? await this.checks.statement(ctx, d.proposal) : null,
        outcome: outcomeDto(d.outcome),
      };
    if (d.kind === "zreport")
      return { ...base, kind: "zreport", zreport: d.status === "open" ? await this.checks.zreport(ctx, d.proposal) : null, outcome: outcomeDto(d.outcome) };
    return { ...base, kind: "bill", proposal: { ...d.proposal, paid: d.proposal.paid ?? null } as BillProposalDTO };
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

/** Another open draft of the same bill: the same seller and number, or with no number the same day and total. */
function sameBillAmong(p: BillProposal, drafts: Draft[], self: string): DuplicateRef | null {
  if (!p.supplierId && !p.supplierName) return null;
  const key = billNumberKey(p.number);
  const total = p.totalKurus ?? lineSum(p);
  const same = drafts.find((d) => {
    if (d.id === self || d.kind !== "bill") return false;
    const q = d.proposal;
    const sameSeller = p.supplierId ? q.supplierId === p.supplierId : !q.supplierId && q.supplierName === p.supplierName;
    if (!sameSeller) return false;
    if (key) return billNumberKey(q.number) === key;
    return !!p.date && q.date === p.date && Math.abs((q.totalKurus ?? lineSum(q)) - total) <= SAME_TOTAL_KURUS;
  });
  return same ? { kind: "draft", id: same.id, title: same.title, why: key ? "number" : "dayTotal" } : null;
}

/** The one live supplier whose email the bill came from. */
export function supplierByEmail(suppliers: Supplier[], sender: string | null): Supplier | null {
  const from = sender?.trim().toLowerCase();
  if (!from) return null;
  const hits = suppliers.filter((s) => !s.archivedAt && s.email?.trim().toLowerCase() === from);
  return hits.length === 1 ? hits[0]! : null;
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

/** Matches learned for this supplier first; one learned for other suppliers only when they all agree. */
function learnedMatches(all: LineMatch[], supplierId: string | null): Map<string, LineMatch> {
  const out = new Map<string, LineMatch>();
  const elsewhere = new Map<string, LineMatch[]>();
  for (const m of all) {
    if (m.supplierId === supplierId) out.set(m.readKey, m);
    else elsewhere.set(m.readKey, [...(elsewhere.get(m.readKey) ?? []), m]);
  }
  for (const [key, ms] of elsewhere) {
    if (!out.has(key) && ms.every((m) => m.itemId === ms[0]!.itemId))
      out.set(key, { ...ms[0]!, perUnitMilli: ms.every((m) => m.perUnitMilli === ms[0]!.perUnitMilli) ? ms[0]!.perUnitMilli : null });
  }
  return out;
}

const lineSum = (p: Pick<BillProposal, "lines">) => p.lines.reduce((s, l) => s + l.totalKurus, 0);

function titleOf(p: BillProposal, read: ReadBill, fallback = "Fatura"): string {
  const total = p.totalKurus ?? read.lines.reduce((s, l) => s + l.totalKurus, 0);
  return [p.supplierName ?? fallback, total ? formatTL(total) : null].filter(Boolean).join(" · ").slice(0, 120);
}

/** "12/14 satır eşleşti" or "Z raporu: 1 fark", for the log. */
function checkedDetail(kind: "statement" | "zreport", o: CheckOutcome): string {
  const parts = kind === "statement" ? [`${o.matched}/${o.matched + o.unmatched} satır eşleşti`] : [o.unmatched ? `${o.unmatched} fark` : "kasayla tutuyor"];
  if (o.correctionKurus) parts.push(`banka bakiyesi ${formatTL(o.correctionKurus)} düzeltildi`);
  if (o.note) parts.push(`“${o.note}”`);
  return parts.join(" · ").slice(0, 300);
}

/** Which parts of the bill the person changed before confirming, for the log. */
function changedFields(p: BillProposal, input: BillInput, paid: string | null): string[] {
  const out: string[] = [];
  if ((p.supplierId ?? null) !== (input.supplierId ?? null)) out.push("supplier");
  if ((p.date ?? null) !== input.date) out.push("date");
  if ((p.number ?? null) !== (input.number ?? null)) out.push("number");
  if ((p.dueDate ?? null) !== (input.dueDate ?? null)) out.push("dueDate");
  const line = (l: { itemId: string | null; name?: string; category?: string; qtyMilli?: number | null; totalKurus: number }) =>
    [l.itemId ?? "", l.itemId ? "" : (l.name ?? ""), l.itemId ? "" : (l.category ?? ""), l.qtyMilli ?? "", l.totalKurus].join("|");
  if (p.lines.map(line).join("\n") !== input.lines.map(line).join("\n")) out.push("lines");
  const kdv = (k: { ratePct: number; amountKurus: number }[] = []) => k.map((x) => `${x.ratePct}:${x.amountKurus}`).join(",");
  if (kdv(p.kdv) !== kdv(input.kdv)) out.push("kdv");
  if ((p.paid?.method ?? null) !== paid) out.push("paid");
  return out;
}

function friendlyError(error: string | null, source: "document" | "note" = "document"): string {
  if (error?.startsWith("AI_UNAVAILABLE")) return "Asistana şu an ulaşılamadı.";
  if (error?.startsWith("AI_OFF")) return "Asistan kapalı.";
  if (error?.startsWith("AI_REJECTED")) return source === "note" ? "Asistan bu notu kabul etmedi." : "Asistan bu belgeyi kabul etmedi.";
  return source === "note" ? "Not okunamadı." : "Belge okunamadı.";
}

/**
 * The demo's stand-in for OpenAI: it doesn't look at the document, it answers with a
 * made-up packaging bill so Taslaklar can be tried without a key. Like the real model, it
 * picks the cups out of the stock list it's given.
 */
export function demoModel(today: () => string): AiModel {
  return new ScriptedModel((request) => {
    if (request.purpose === NOTE) return demoQuick(request.parts.map((p) => (p.type === "text" ? p.text : "")));
    if (request.purpose !== READ) return {};
    const list = request.parts.find((p) => p.type === "text")?.text ?? "";
    // The file's name says what a sample is (piece 27): "z-raporu-….pdf", "banka-ekstresi-….pdf".
    const named = /^Read this document \(([^)]*)\)/.exec(list)?.[1] ?? "";
    const kind = /z[-_ ]?rapor/i.test(named)
      ? "zReport"
      : /ekstre|statement/i.test(named)
        ? /kart|card|kredi/i.test(named)
          ? "cardStatement"
          : "bankStatement"
        : null;
    if (kind)
      return {
        kind,
        supplierName: null,
        supplierTaxNumber: null,
        number: null,
        date: null,
        dueDate: null,
        total: null,
        lines: [],
        kdv: [],
        doubts: [],
      } satisfies BillReading;
    const cups = /^(\d+)\. Karton bardak/m.exec(list);
    return {
      kind: "bill",
      supplierName: "Ambalaj Dünyası Tic. Ltd. Şti.",
      supplierTaxNumber: null,
      number: "A-20511",
      date: today(),
      dueDate: null,
      total: 1810,
      lines: [
        {
          name: "Karton bardak 8 oz",
          quantity: 1000,
          unit: "adet",
          total: 1450,
          category: "supplies",
          stockItem: cups ? Number(cups[1]) : null,
          stockQuantity: cups ? 1000 : null,
        },
        { name: "Peçete", quantity: 20, unit: "adet", total: 360, category: "supplies", stockItem: null, stockQuantity: null },
      ],
      kdv: [{ rate: 20, amount: 301.67 }],
      doubts: ["Demo: belge gerçekten okunmadı, bu örnek bir okuma."],
    } satisfies BillReading;
  }, "demo");
}

/** What the demo "hears" (piece 28): there's no recording to listen to without a key. */
export const DEMO_HEARD = "Dün tesisatçıya 450 lira nakit ödedim";

export function demoTranscriber(): Transcriber {
  return new ScriptedTranscriber(() => DEMO_HEARD, "demo");
}

/**
 * The demo's reading of a quick entry: amounts, "nakit"/"kart"/"havale", "dün", and who it
 * went to are picked out by rule, so typing something of your own does something sensible.
 * "…, simitçiye 120" makes a second expense.
 */
function demoQuick([context = "", said = ""]: string[]): QuickReading {
  const today = /Today is (\d{4}-\d{2}-\d{2})/.exec(context)?.[1] ?? "";
  const list = context.split("Stock items:")[0]!.split("Suppliers:")[1] ?? "";
  const suppliers = [...list.matchAll(/^(\d+)\. (.+)$/gm)];
  const text = said.replace(/^What they (?:wrote|said):\n/, "");
  const lower = trLower(text);
  const yesterday = today ? new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : today;
  const paidOf = (t: string): QuickReading["expenses"][number]["paid"] | null =>
    /nakit|elden|kasadan/.test(t)
      ? "cash"
      : /kredi kart/.test(t)
        ? "credit"
        : /kart/.test(t)
          ? "card"
          : /havale|eft|bankadan/.test(t)
            ? "bank"
            : /borç|veresiye|sonra öde/.test(t)
              ? "unpaid"
              : null;
  const everyPaid = paidOf(lower) ?? "unknown";
  const parts = lower.split(/,|\bve\b/).filter((p) => /\d/.test(p));
  const expenses = parts.flatMap((part) => {
    const m = /(\d[\d.]*(?:,\d+)?)\s*(bin)?/.exec(part);
    if (!m) return [];
    const total = Number(m[1]!.replace(/\./g, "").replace(",", ".")) * (m[2] ? 1000 : 1);
    const word = part
      .slice(0, m.index)
      .split(/\s+/)
      .filter((w) => w && !/^(dün|bugün|sabah|akşam|öğlen)$/.test(w))
      .join(" ")
      .replace(/'?y?[ae]$/, "");
    const name = word ? word.charAt(0).toLocaleUpperCase("tr-TR") + word.slice(1) : "Gider";
    const supplier = suppliers.find((s) => trLower(s[2]!).split(/\s+/)[0] === trLower(name).split(/\s+/)[0]);
    const category = /tesisat|usta|tamir|elektrikçi|temizlik/.test(part)
      ? "services"
      : /süt|simit|kahve|şeker|çay|un\b|meyve/.test(part)
        ? "ingredients"
        : /bardak|peçete|deterjan|poşet/.test(part)
          ? "supplies"
          : /kira/.test(part)
            ? "rent"
            : /fatura|internet|doğalgaz|su /.test(part)
              ? "utilities"
              : "other";
    return [
      {
        supplier: supplier ? Number(supplier[1]) : null,
        supplierName: supplier ? null : name,
        date: /dün/.test(lower) ? yesterday : today,
        dueDate: null,
        paid: paidOf(part) ?? everyPaid,
        lines: [{ name: category === "services" ? "İşçilik" : name, quantity: null, unit: null, total, category, stockItem: null, stockQuantity: null }],
      } satisfies QuickReading["expenses"][number],
    ];
  });
  return {
    expenses,
    doubts: expenses.length ? ["Demo: not gerçekten okunmadı; tutar, gün ve ödeme şekli basit kurallarla çıkarıldı."] : ["Bunda bir tutar bulamadım."],
  };
}
