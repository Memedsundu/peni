import type { BillCategory, BillKdv } from "./bills";
import type { CheckOutcome, StatementProposal, ZReportProposal } from "./checks";
import { sniffImageType, type ImageType } from "./images";
import { MILLI, STOCK_MAX_MILLI, type NewStockItem, type StockKind, type StockUnit } from "./stock";

/**
 * The assistant's ground (plan piece 24): the documents a café hands it, the drafts it
 * writes, the background jobs that do the reading, and a log of all of it.
 *
 * The rule (D21): the assistant prepares, a person confirms. A draft is only a proposal;
 * nothing in the café's books changes until someone with the right to make that record
 * confirms it, and the record is then made in their name. The assistant never pays or
 * deletes anything.
 */

// ─────────────────────────────────────────────── documents

/** A receipt, invoice or statement as uploaded: a photo or a PDF, or a statement as a spreadsheet (piece 27). */
export type DocumentType = ImageType | "application/pdf" | SheetType;

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type SheetType = typeof XLSX_TYPE | "text/csv";
export const isSheet = (t: string): t is SheetType => t === XLSX_TYPE || t === "text/csv";

/** The most one document may weigh. Phones' photos are shrunk before they're sent. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_NAME_MAX = 120;

/**
 * Kept in Postgres for now, like the feed's photos (piece 14); a file store can take over
 * behind this interface later. Unlike photos, documents are private to the café's staff.
 */
export interface StoredDocument {
  id: string;
  cafeId: string;
  /** The file's name as it came, or "" for a photo taken in the app. */
  name: string;
  contentType: DocumentType;
  bytes: Uint8Array;
  size: number;
  /** Hex SHA-256 of the bytes: the same file twice is found (piece 25's duplicate guard). */
  sha256: string;
  /** The staff member who sent it; "" for one that came by email. */
  uploadedBy: string;
  /** The email it came in (piece 26), and who sent it. */
  emailId: string | null;
  sender: string | null;
  createdAt: Date;
}

/** What the bytes really are; null for anything that isn't a photo, a PDF, an Excel file or a CSV. */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  const image = sniffImageType(bytes);
  if (image) return image;
  // An .xlsx is a zip whose parts sit under "xl/".
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return hasAscii(bytes, "xl/") ? XLSX_TYPE : null;
  return looksLikeCsv(bytes) ? "text/csv" : null;
}

function hasAscii(bytes: Uint8Array, text: string): boolean {
  const codes = [...text].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i + codes.length <= bytes.length; i++) {
    for (let k = 0; k < codes.length; k++) if (bytes[i + k] !== codes[k]) continue outer;
    return true;
  }
  return false;
}

/** Text with no control bytes, at least two lines, and a separator on the first. */
function looksLikeCsv(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 4096);
  let lines = 0;
  for (const b of head) {
    if (b === 0x0a) lines++;
    else if (b < 0x20 && b !== 0x09 && b !== 0x0d) return false;
  }
  if (lines < 1) return false;
  const first = new TextDecoder("latin1").decode(head.subarray(0, head.indexOf(0x0a)));
  return /[;,\t|]/.test(first);
}

// ─────────────────────────────────────────────── quick entry (plan piece 28)

/**
 * "Tesisatçıya 450 lira nakit ödedim": a line typed or said instead of a document (A7).
 * Speech is turned into text first and shown to the person, who can fix it before it's
 * read; the recording itself is never kept.
 */
export interface QuickEntry {
  text: string;
  /** Whether it was said rather than typed. */
  voice: boolean;
}

export const QUICK_TEXT_MAX = 500;
/** One entry may hold a few expenses ("…ve simitçiye 120"); each becomes its own draft. */
export const QUICK_DRAFTS_MAX = 5;
/** Quick entries a café may send in a day, typed or said. */
export const QUICK_PER_DAY = 200;
/** A recording: about a minute of speech from a phone or a laptop. */
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const AUDIO_SECONDS_MAX = 60;

export type AudioType = "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg" | "audio/wav";

/** What a recording really is, from its first bytes; null for anything else. */
export function sniffAudioType(bytes: Uint8Array): AudioType | null {
  const at = (i: number, text: string) => [...text].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (at(0, "OggS")) return "audio/ogg";
  if (at(4, "ftyp")) return "audio/mp4";
  if (at(0, "RIFF") && at(8, "WAVE")) return "audio/wav";
  if (at(0, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) return "audio/mpeg";
  return null;
}

/** How the person said a bill was paid; "credit" is the café's credit card. */
export type ProposalPaidMethod = "cash" | "card" | "bank" | "credit";

// ─────────────────────────────────────────────── drafts

/**
 * What a draft is: a bill to add, or a statement or Z report to check against Peni's own
 * records (piece 27). A quick entry (piece 28) becomes a bill draft too.
 */
export type DraftKind = "bill" | "statement" | "zreport";
export type DraftStatus = "open" | "confirmed" | "dismissed";

/** A bill as the assistant proposes it. Unlike a bill, anything it couldn't read is null. */
export interface BillProposal {
  /** A supplier the café already has, when the name matched one. */
  supplierId: string | null;
  /** The seller's name as printed; offered as a new supplier when nothing matched. */
  supplierName: string | null;
  supplierTaxNumber: string | null;
  /** What else the bill shows about the seller, for a new supplier. Drafts written before this have none. */
  supplierPhone?: string | null;
  supplierIban?: string | null;
  supplierAddress?: string | null;
  /** How the supplier was found: as a person confirmed it before, or by the name, tax number or sender read. */
  supplierMatchedBy?: "learned" | "read" | null;
  /** With no supplier found: the café's suppliers the name could be (two that fit equally), to pick from. */
  supplierChoices?: string[];
  number: string | null;
  date: string | null;
  dueDate: string | null;
  /** The total printed on the document, to compare the lines with. */
  totalKurus: number | null;
  lines: ProposalLine[];
  /** The KDV printed on it, per rate (piece 25). */
  kdv: BillKdv[];
  /** A quick entry that said it was already paid, and how (piece 28); null when it didn't say. */
  paid?: { method: ProposalPaidMethod } | null;
}

export interface ProposalLine {
  /** The stock item it was matched to (piece 25), or null for an expense line. */
  itemId: string | null;
  /**
   * Or the stock item it could start: a line that looks like something the café keeps (an
   * ingredient or supply with an amount) but matches none of its items. Confirming it as is
   * creates the item and adds the amount; the person can rename it, pick an existing item
   * or keep it an expense. Drafts written before this have none.
   */
  newItem?: NewStockItem | null;
  /** The item's name for a stock line (or the new item's), else what was read. */
  name: string;
  category: BillCategory;
  /** Stock lines (and new items): how much came, in thousandths of the item's unit; null when it couldn't be worked out. */
  qtyMilli: number | null;
  totalKurus: number;
  /** The line as printed, so the person can see what it was matched from. */
  readName: string;
  readQtyMilli: number | null;
  readUnit: string | null;
  /** How it was matched: the model's guess, or what a person confirmed for this line before. */
  matchedBy: "model" | "learned" | null;
}

/** An earlier bill or draft that looks like the same document (piece 25's duplicate guard). */
export interface DuplicateRef {
  kind: "bill" | "draft";
  id: string;
  title: string;
  /** Why it looks the same: the same file, the same number, or the same day and total. */
  why: "file" | "number" | "dayTotal";
}

/** A draft of each kind; its proposal is as the assistant wrote it, never changed afterwards. */
export type Draft = BillDraft | StatementDraft | ZReportDraft;
export type BillDraft = DraftBase & { kind: "bill"; proposal: BillProposal };
export type StatementDraft = DraftBase & { kind: "statement"; proposal: StatementProposal };
export type ZReportDraft = DraftBase & { kind: "zreport"; proposal: ZReportProposal };

interface DraftBase {
  id: string;
  cafeId: string;
  status: DraftStatus;
  /** One line for lists: "Moda Süt · ₺1.234,50". */
  title: string;
  /** What the assistant wasn't sure of, in words for the owner. */
  doubts: string[];
  /** The document it was read from. */
  documentId: string | null;
  /** Or what was typed or said, for a quick entry (piece 28). */
  entry: QuickEntry | null;
  jobId: string | null;
  createdAt: Date;
  decidedById: string | null;
  decidedAt: Date | null;
  /** The record it became (a bill id) once confirmed. */
  resultId: string | null;
  /** Which fields the person changed before confirming, for the log: "date", "lines". */
  changed: string[];
  dismissReason: string | null;
  /** What it may repeat; confirming it anyway needs a second word. */
  duplicateOf: DuplicateRef | null;
  /** For a statement or Z report: what the person saw when they said it was checked. */
  outcome: CheckOutcome | null;
}

/**
 * What a person confirmed a read line to be (piece 25): "SÜT 1LT TAM YAĞLI" from Moda Süt
 * is the stock item Süt, one of them being a litre. The next bill from them is matched the
 * same way without asking the model to guess again.
 *
 * The pack size comes with it: "Laktozsuz Süt 1 L, 2 koli" confirmed as 24 l means one koli
 * from them is 12 l, so their next "3 koli" is 36 l whatever the model makes of it. It holds
 * only for the unit it was learned in: "24 adet" of the same line isn't 288 l.
 */
export interface LineMatch {
  cafeId: string;
  /** The supplier it was learned for; null for a bill with no supplier. */
  supplierId: string | null;
  /** The read name, tidied (see `lineKey`). */
  readKey: string;
  /** The stock item it is; null when a person kept the line as an expense, so it isn't offered as stock again. */
  itemId: string | null;
  /** The pack size: thousandths of the item's unit per one read unit; null when the quantity wasn't read. */
  perUnitMilli: number | null;
  /** The printed unit the pack size is for ("koli", "adet"); null when none was printed. */
  readUnit: string | null;
  updatedAt: Date;
}

/**
 * The amount a learned pack size gives for a line: "3 koli" at 12 l a koli is 36 l. Null when
 * the line wasn't printed in the unit the pack size was learned in, or the result is no amount.
 */
export function packAmount(
  match: Pick<LineMatch, "perUnitMilli" | "readUnit">,
  read: { qtyMilli: number | null; unit: string | null },
): number | null {
  // A match learned before units were kept has none, and holds as it did then: for any unit.
  if (!match.perUnitMilli || !read.qtyMilli || (match.readUnit && match.readUnit !== read.unit)) return null;
  const milli = Math.round((read.qtyMilli * match.perUnitMilli) / MILLI);
  return milli > 0 && milli <= STOCK_MAX_MILLI ? milli : null;
}

/** The pack size a confirmed line shows: 24 l from "2 koli" is 12 l a koli (12 000 thousandths). */
export function packSize(readQtyMilli: number | null, qtyMilli: number | null): number | null {
  if (!readQtyMilli || !qtyMilli || readQtyMilli <= 0 || qtyMilli <= 0) return null;
  return Math.round((qtyMilli * MILLI) / readQtyMilli);
}

/** "SÜT 1 LT. Tam-Yağlı" and "süt 1 lt tam yağlı" are the same line. */
export function lineKey(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Which supplier a person confirmed a bill's seller to be: "MODA SÜT ÜRN. LTD." or tax number
 * 1234567890 is Moda Süt. Their next bill goes to Moda Süt before anything is guessed, and
 * the lines learned for Moda Süt apply to it.
 */
export interface SupplierMatch {
  cafeId: string;
  /** The read seller, tidied: "tax:1234567890" or "name:moda süt ürn". */
  readKey: string;
  supplierId: string;
  updatedAt: Date;
}

export const DISMISS_REASON_MAX = 200;

// ─────────────────────────────────────────────── jobs

/**
 * Work that runs in the background (reading a document, later the weekly letter). Kept in
 * Postgres, so there's nothing extra to host: a job runs right after it's added, and
 * whatever is left (a crash, a retry later) runs on the next pass.
 */
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  cafeId: string;
  /** Which handler runs it: "document.read". */
  kind: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  /** Tries so far, the running one included. */
  attempts: number;
  /** Not before this. */
  runAt: Date;
  /** While running: another pass may take it over after this, if the first one died. */
  lockedUntil: Date | null;
  lastError: string | null;
  result: Record<string, unknown> | null;
  createdAt: Date;
  finishedAt: Date | null;
}

/** A job is given up on after this many tries. */
export const JOB_MAX_ATTEMPTS = 3;
/** How long to wait before the second and third try. */
export const JOB_RETRY_MS = [60_000, 10 * 60_000] as const;
/** How long one try may hold a job before another pass may take it. */
export const JOB_LOCK_MS = 5 * 60_000;

// ─────────────────────────────────────────────── the log

/**
 * Everything the assistant did and everything people did with it, for "Kayıt": each call
 * to the model (what for, which model, tokens, how long, whether it worked), each draft
 * written, confirmed or dismissed, and each job that gave up.
 */
export type AiEventKind =
  | "document.uploaded"
  | "email.received"
  | "note.sent"
  | "ai.call"
  | "draft.created"
  | "draft.confirmed"
  | "draft.dismissed"
  | "job.failed";

export interface AiEvent {
  id: string;
  cafeId: string;
  at: Date;
  kind: AiEventKind;
  /** Who did it, or who started the work the assistant did; null for the assistant on its own. */
  memberId: string | null;
  purpose: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  ms: number | null;
  ok: boolean;
  /** A short note: an error, a reason, what was changed. */
  detail: string | null;
  draftId: string | null;
  documentId: string | null;
  jobId: string | null;
}

// ─────────────────────────────────────────────── the email inbox (plan piece 26)

/**
 * Each café's own address for bills (A4): suppliers send e-invoices there, or the owner
 * forwards what lands in their own mailbox. The token is the secret part of the address;
 * a new one retires the old address at once.
 */
export interface CafeInbox {
  cafeId: string;
  token: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Why a file in an email wasn't read. */
export type SkipReason = "type" | "large" | "same" | "limit";

/** One email that reached a café's address, and what became of each file in it. */
export interface InboundEmail {
  id: string;
  cafeId: string;
  /** The mail service's id for it: the same email delivered twice is taken once. */
  providerId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  documents: { documentId: string; name: string }[];
  skipped: { name: string; why: SkipReason }[];
}

/** Ten letters and digits a person can read out: about 50 bits. */
export const INBOX_TOKEN_LENGTH = 10;
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newInboxToken(random: (n: number) => Uint8Array): string {
  return [...random(INBOX_TOKEN_LENGTH)].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

/** "moda.k3x9q2mfa7@fatura.peni.app" */
export function inboxAddress(slug: string, token: string, domain: string): string {
  return `${slug}.${token}@${domain}`;
}

/**
 * The inbox tokens in a list of recipients ("Moda <moda.k3x9q2mfa7@fatura.peni.app>"),
 * only for addresses at our domain. The slug is for people; the token alone decides.
 */
export function inboxTokens(recipients: string[], domain: string): string[] {
  const tokens = new Set<string>();
  const host = domain.toLowerCase();
  for (const r of recipients) {
    const m = /<?([^<>\s@]+)@([^<>\s@]+?)>?\s*$/.exec(r.trim());
    if (!m || m[2]!.toLowerCase() !== host) continue;
    const local = m[1]!.toLowerCase().split("+")[0]!;
    const token = local.slice(local.lastIndexOf(".") + 1);
    if (token.length === INBOX_TOKEN_LENGTH && [...token].every((c) => TOKEN_ALPHABET.includes(c))) tokens.add(token);
  }
  return [...tokens];
}

// ─────────────────────────────────────────────── the store

export interface AssistantStore {
  saveDocument(doc: StoredDocument): Promise<void>;
  getDocument(cafeId: string, id: string): Promise<StoredDocument | null>;

  /** A document without its bytes: for a link to it. */
  getDocumentInfo(cafeId: string, id: string): Promise<Omit<StoredDocument, "bytes"> | null>;
  /** Earlier uploads of the same bytes, newest first, without their bytes. */
  findDocuments(cafeId: string, sha256: string): Promise<Omit<StoredDocument, "bytes">[]>;

  saveDraft(draft: Draft): Promise<void>;
  getDraft(cafeId: string, id: string): Promise<Draft | null>;
  getDraftByDocument(cafeId: string, documentId: string): Promise<Draft | null>;
  /** Newest first. */
  listDrafts(cafeId: string, opts: { status?: DraftStatus; limit: number }): Promise<Draft[]>;
  /** Open drafts, for Bugün's count. */
  countOpenDrafts(cafeId: string): Promise<number>;

  addJob(job: Job): Promise<void>;
  saveJob(job: Job): Promise<void>;
  getJob(id: string): Promise<Job | null>;
  /**
   * Takes up to `limit` jobs that are due (queued and past runAt, or running with a lock
   * that ran out), marks them running with one more attempt and a lock until
   * `lockedUntil`, and returns them. Two passes at once never get the same job.
   */
  claimJobs(now: Date, limit: number, lockedUntil: Date): Promise<Job[]>;
  /** A café's jobs of these kinds added since `since`, newest first. */
  listJobs(cafeId: string, opts: { kinds: string[]; since: Date }): Promise<Job[]>;

  addEvent(event: AiEvent): Promise<void>;
  /** Newest first; `before` pages back. */
  listEvents(cafeId: string, opts: { limit: number; before?: Date }): Promise<AiEvent[]>;
  /** Calls to the model and the tokens they used, from `from` up to `to`. */
  usage(cafeId: string, from: Date, to: Date): Promise<{ calls: number; inputTokens: number; outputTokens: number }>;

  listLineMatches(cafeId: string): Promise<LineMatch[]>;
  /** One per café, supplier and read name: a newer one replaces it. */
  saveLineMatch(match: LineMatch): Promise<void>;
  deleteLineMatch(cafeId: string, supplierId: string | null, readKey: string): Promise<void>;

  listSupplierMatches(cafeId: string): Promise<SupplierMatch[]>;
  /** One per café and read seller: a newer one replaces it. */
  saveSupplierMatch(match: SupplierMatch): Promise<void>;
  deleteSupplierMatch(cafeId: string, readKey: string): Promise<void>;

  getInbox(cafeId: string): Promise<CafeInbox | null>;
  findInbox(token: string): Promise<CafeInbox | null>;
  saveInbox(inbox: CafeInbox): Promise<void>;
  /** Claims the email for the café; false when it already has it (taken the first time). */
  addInboundEmail(email: InboundEmail): Promise<boolean>;
  /** What became of its files, once they're taken. */
  saveInboundEmail(email: InboundEmail): Promise<void>;
  findInboundEmail(cafeId: string, providerId: string): Promise<InboundEmail | null>;
  /** Newest first; `since` for the day's count. */
  listInboundEmails(cafeId: string, opts: { limit: number; since?: Date }): Promise<InboundEmail[]>;
}

export class InMemoryAssistantStore implements AssistantStore {
  private readonly documents = new Map<string, StoredDocument>();
  private readonly drafts = new Map<string, Draft>();
  private readonly jobs = new Map<string, Job>();
  private readonly events: AiEvent[] = [];
  private readonly matches = new Map<string, LineMatch>();
  private readonly sellers = new Map<string, SupplierMatch>();
  private readonly inboxes = new Map<string, CafeInbox>();
  private readonly emails: InboundEmail[] = [];

  async saveDocument(doc: StoredDocument) {
    this.documents.set(doc.id, { ...doc, bytes: doc.bytes.slice() });
  }
  async getDocument(cafeId: string, id: string) {
    const d = this.documents.get(id);
    return d && d.cafeId === cafeId ? { ...d, bytes: d.bytes.slice() } : null;
  }

  async getDocumentInfo(cafeId: string, id: string) {
    const d = this.documents.get(id);
    if (!d || d.cafeId !== cafeId) return null;
    const { bytes: _bytes, ...info } = d;
    return info;
  }
  async findDocuments(cafeId: string, sha256: string) {
    return [...this.documents.values()]
      .filter((d) => d.cafeId === cafeId && d.sha256 === sha256)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ bytes: _bytes, ...d }) => d);
  }

  async saveDraft(draft: Draft) {
    this.drafts.set(draft.id, structuredClone(draft));
  }
  async getDraft(cafeId: string, id: string) {
    const d = this.drafts.get(id);
    return d && d.cafeId === cafeId ? structuredClone(d) : null;
  }
  async getDraftByDocument(cafeId: string, documentId: string) {
    const d = [...this.drafts.values()].find((x) => x.cafeId === cafeId && x.documentId === documentId);
    return d ? structuredClone(d) : null;
  }
  async listDrafts(cafeId: string, opts: { status?: DraftStatus; limit: number }) {
    return [...this.drafts.values()]
      .filter((d) => d.cafeId === cafeId && (!opts.status || d.status === opts.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, opts.limit)
      .map((d) => structuredClone(d));
  }
  async countOpenDrafts(cafeId: string) {
    return [...this.drafts.values()].filter((d) => d.cafeId === cafeId && d.status === "open").length;
  }

  async addJob(job: Job) {
    this.jobs.set(job.id, structuredClone(job));
  }
  async saveJob(job: Job) {
    this.jobs.set(job.id, structuredClone(job));
  }
  async getJob(id: string) {
    const j = this.jobs.get(id);
    return j ? structuredClone(j) : null;
  }
  async claimJobs(now: Date, limit: number, lockedUntil: Date) {
    const due = [...this.jobs.values()]
      .filter((j) => (j.status === "queued" && j.runAt <= now) || (j.status === "running" && j.lockedUntil !== null && j.lockedUntil <= now))
      .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
      .slice(0, limit);
    for (const j of due) Object.assign(j, { status: "running", attempts: j.attempts + 1, lockedUntil });
    return due.map((j) => structuredClone(j));
  }
  async listJobs(cafeId: string, opts: { kinds: string[]; since: Date }) {
    return [...this.jobs.values()]
      .filter((j) => j.cafeId === cafeId && opts.kinds.includes(j.kind) && j.createdAt >= opts.since)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((j) => structuredClone(j));
  }

  async addEvent(event: AiEvent) {
    this.events.push({ ...event });
  }
  async listEvents(cafeId: string, opts: { limit: number; before?: Date }) {
    return this.events
      .filter((e) => e.cafeId === cafeId && (!opts.before || e.at < opts.before))
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id))
      .slice(0, opts.limit)
      .map((e) => ({ ...e }));
  }
  async usage(cafeId: string, from: Date, to: Date) {
    const calls = this.events.filter((e) => e.cafeId === cafeId && e.kind === "ai.call" && e.at >= from && e.at < to);
    return {
      calls: calls.length,
      inputTokens: calls.reduce((s, e) => s + e.inputTokens, 0),
      outputTokens: calls.reduce((s, e) => s + e.outputTokens, 0),
    };
  }

  async listLineMatches(cafeId: string) {
    return [...this.matches.values()].filter((m) => m.cafeId === cafeId).map((m) => ({ ...m }));
  }
  async saveLineMatch(match: LineMatch) {
    this.matches.set(`${match.cafeId}|${match.supplierId ?? ""}|${match.readKey}`, { ...match });
  }
  async deleteLineMatch(cafeId: string, supplierId: string | null, readKey: string) {
    this.matches.delete(`${cafeId}|${supplierId ?? ""}|${readKey}`);
  }

  async listSupplierMatches(cafeId: string) {
    return [...this.sellers.values()].filter((m) => m.cafeId === cafeId).map((m) => ({ ...m }));
  }
  async saveSupplierMatch(match: SupplierMatch) {
    this.sellers.set(`${match.cafeId}|${match.readKey}`, { ...match });
  }
  async deleteSupplierMatch(cafeId: string, readKey: string) {
    this.sellers.delete(`${cafeId}|${readKey}`);
  }

  async getInbox(cafeId: string) {
    const i = this.inboxes.get(cafeId);
    return i ? { ...i } : null;
  }
  async findInbox(token: string) {
    const i = [...this.inboxes.values()].find((x) => x.token === token);
    return i ? { ...i } : null;
  }
  async saveInbox(inbox: CafeInbox) {
    this.inboxes.set(inbox.cafeId, { ...inbox });
  }
  async addInboundEmail(email: InboundEmail) {
    if (this.emails.some((e) => e.cafeId === email.cafeId && e.providerId === email.providerId)) return false;
    this.emails.push(structuredClone(email));
    return true;
  }
  async saveInboundEmail(email: InboundEmail) {
    const i = this.emails.findIndex((e) => e.id === email.id);
    if (i >= 0) this.emails[i] = structuredClone(email);
  }
  async findInboundEmail(cafeId: string, providerId: string) {
    const e = this.emails.find((x) => x.cafeId === cafeId && x.providerId === providerId);
    return e ? structuredClone(e) : null;
  }
  async listInboundEmails(cafeId: string, opts: { limit: number; since?: Date }) {
    return this.emails
      .filter((e) => e.cafeId === cafeId && (!opts.since || e.receivedAt >= opts.since))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.id.localeCompare(a.id))
      .slice(0, opts.limit)
      .map((e) => structuredClone(e));
  }
}
