import type { BillCategory, BillKdv } from "./bills";
import { sniffImageType, type ImageType } from "./images";

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

/** A receipt, invoice or statement as uploaded: a photo or a PDF. */
export type DocumentType = ImageType | "application/pdf";

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

/** What the bytes really are; null for anything that isn't a photo or a PDF. */
export function sniffDocumentType(bytes: Uint8Array): DocumentType | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return sniffImageType(bytes);
}

// ─────────────────────────────────────────────── drafts

/** What a draft becomes when confirmed. Bills first; quick entries and statements follow (pieces 27, 28). */
export type DraftKind = "bill";
export type DraftStatus = "open" | "confirmed" | "dismissed";

/** A bill as the assistant proposes it. Unlike a bill, anything it couldn't read is null. */
export interface BillProposal {
  /** A supplier the café already has, when the name matched one. */
  supplierId: string | null;
  /** The seller's name as printed; offered as a new supplier when nothing matched. */
  supplierName: string | null;
  supplierTaxNumber: string | null;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  /** The total printed on the document, to compare the lines with. */
  totalKurus: number | null;
  lines: ProposalLine[];
  /** The KDV printed on it, per rate (piece 25). */
  kdv: BillKdv[];
}

export interface ProposalLine {
  /** The stock item it was matched to (piece 25), or null for an expense line. */
  itemId: string | null;
  /** The item's name for a stock line, else what was read. */
  name: string;
  category: BillCategory;
  /** Stock lines: how much came, in thousandths of the item's unit; null when it couldn't be worked out. */
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

export interface Draft {
  id: string;
  cafeId: string;
  kind: DraftKind;
  status: DraftStatus;
  /** One line for lists: "Moda Süt · ₺1.234,50". */
  title: string;
  /** As the assistant wrote it; never changed afterwards. */
  proposal: BillProposal;
  /** What the assistant wasn't sure of, in words for the owner. */
  doubts: string[];
  /** The document it was read from. */
  documentId: string | null;
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
}

/**
 * What a person confirmed a read line to be (piece 25): "SÜT 1LT TAM YAĞLI" from Moda Süt
 * is the stock item Süt, one of them being a litre. The next bill from them is matched the
 * same way without asking the model to guess again.
 */
export interface LineMatch {
  cafeId: string;
  /** The supplier it was learned for; null for a bill with no supplier. */
  supplierId: string | null;
  /** The read name, tidied (see `lineKey`). */
  readKey: string;
  itemId: string;
  /** Thousandths of the item's unit per one read unit; null when the quantity wasn't read. */
  perUnitMilli: number | null;
  updatedAt: Date;
}

/** "SÜT 1 LT. Tam-Yağlı" and "süt 1 lt tam yağlı" are the same line. */
export function lineKey(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 120);
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
export type AiEventKind = "document.uploaded" | "email.received" | "ai.call" | "draft.created" | "draft.confirmed" | "draft.dismissed" | "job.failed";

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
