import type { InboundEmailDTO, InboxDTO } from "@peni/api";
import {
  inboxAddress,
  inboxTokens,
  localDateKey,
  MAX_DOCUMENT_BYTES,
  newInboxToken,
  startOfLocalDay,
  type AssistantStore,
  type CafeInbox,
  type InboundEmail,
  type PeniDirectory,
  type Permission,
  type SkipReason,
} from "@peni/core";
import { randomBytes, randomUUID } from "node:crypto";
import type { AssistantService } from "./assistant";
import { ambalajBill } from "./demo-receipt";
import { eventId } from "./assistant";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

/** A café takes at most this many files a day by email; past it, the rest are listed but not read. */
export const EMAIL_DOCUMENTS_PER_DAY = 60;
/** Files in one email past this are left. */
const FILES_PER_EMAIL = 10;
const EMAILS_SHOWN = 30;
const SUBJECT_MAX = 200;

/** One file in an email, fetched only when the email is for a café that takes it. */
export interface MailFile {
  name: string;
  contentType: string;
  size: number;
  read: () => Promise<Uint8Array>;
}

/** An email as the mail service delivered it. */
export interface Mail {
  /** The mail service's id: the same email delivered twice is taken once. */
  providerId: string;
  from: string;
  /** To, Cc and "received for" (an email forwarded from the owner's own mailbox). */
  recipients: string[];
  subject: string;
  files: () => Promise<MailFile[]>;
}

/**
 * The forward-to-Peni inbox (plan piece 26, A4): each café gets its own address for bills.
 * Suppliers send e-invoices there, or the owner forwards what lands in their own mailbox;
 * each photo or PDF attached is read like an upload, and the draft waits on Taslaklar
 * with who sent it. The address's token is its secret: anyone who has it can send, so a
 * new address retires the old one at once, and the inbox can be turned off.
 */
export class InboxService {
  constructor(
    private readonly store: AssistantStore,
    private readonly assistant: AssistantService,
    private readonly directory: PeniDirectory,
    private readonly config: { domain: string | null; demo: boolean },
    private readonly now: () => Date,
  ) {}

  /** The address (made on the first look) and the latest emails. */
  async view(ctx: StaffContext): Promise<InboxDTO> {
    this.require(ctx, "assistant.use");
    const inbox = this.config.domain ? await this.inbox(ctx.cafe.id) : null;
    const emails = await this.store.listInboundEmails(ctx.cafe.id, { limit: EMAILS_SHOWN });
    return {
      ready: !!this.config.domain,
      address: inbox && this.config.domain ? inboxAddress(ctx.cafe.slug, inbox.token, this.config.domain) : null,
      enabled: inbox?.enabled ?? false,
      canManage: ctx.permissions.has("bills.manage"),
      canSendSample: this.config.demo && !!inbox?.enabled && this.assistant.mode !== "off",
      emails: await this.emailsDto(ctx.cafe.id, emails),
    };
  }

  /** On or off, or a new address: the old one stops working at once. */
  async update(ctx: StaffContext, input: { enabled?: boolean; newAddress?: true }): Promise<InboxDTO> {
    this.require(ctx, "bills.manage");
    if (!this.config.domain) throw new AppError("INBOX_NOT_READY", "This server doesn't take email yet", 409);
    const inbox = await this.inbox(ctx.cafe.id);
    if (input.enabled !== undefined) inbox.enabled = input.enabled;
    if (input.newAddress) inbox.token = await this.freshToken();
    inbox.updatedAt = this.now();
    await this.store.saveInbox(inbox);
    return this.view(ctx);
  }

  /**
   * An email from the mail service. It goes to every café whose address it was sent to
   * (unknown or retired addresses are ignored without a word, so they can't be probed),
   * once per café. Returns how many files were taken to be read.
   */
  async receive(mail: Mail): Promise<number> {
    const domain = this.config.domain;
    if (!domain) return 0;
    let taken = 0;
    let files: Fetched[] | null = null;
    for (const token of inboxTokens(mail.recipients, domain)) {
      const inbox = await this.store.findInbox(token);
      if (!inbox?.enabled || (await this.store.findInboundEmail(inbox.cafeId, mail.providerId))) continue;
      // Downloaded before the email is taken: if the mail service fails us, its retry finds it new.
      files ??= await fetchFiles(await mail.files());
      const email: InboundEmail = {
        id: `eml_${randomUUID()}`,
        cafeId: inbox.cafeId,
        providerId: mail.providerId,
        sender: senderAddress(mail.from),
        subject: mail.subject.trim().slice(0, SUBJECT_MAX),
        receivedAt: this.now(),
        documents: [],
        skipped: [],
      };
      if (!(await this.store.addInboundEmail(email))) continue;
      taken += await this.take(email, files);
    }
    return taken;
  }

  /** Demo only: Ambalaj Dünyası emails a bill to the café's address. */
  async sample(ctx: StaffContext): Promise<InboxDTO> {
    this.require(ctx, "assistant.use");
    if (!this.config.demo || !this.config.domain) throw new AppError("INBOX_SAMPLE_DEMO", "Only the demo sends sample emails", 409);
    const inbox = await this.inbox(ctx.cafe.id);
    const { timeZone } = await this.directory.getSettings(ctx.cafe.id);
    // Each sample is its own e-invoice copy, so the same-file guard doesn't stop the next one.
    const sent = randomUUID().slice(0, 8).toUpperCase();
    const bill = ambalajBill(localDateKey(this.now(), timeZone).split("-").reverse().join("."), `e-Fatura gonderim no: ${sent}`);
    await this.receive({
      providerId: `sample_${randomUUID()}`,
      from: "Ambalaj Dünyası <satis@ambalajdunyasi.test>",
      recipients: [inboxAddress(ctx.cafe.slug, inbox.token, this.config.domain)],
      subject: "e-Fatura: A-20511",
      files: async () => [
        { name: "A-20511.pdf", contentType: "application/pdf", size: bill.length, read: async () => bill },
        { name: "A-20511.xml", contentType: "application/xml", size: 64, read: async () => new TextEncoder().encode("<Invoice/>") },
      ],
    });
    return this.view(ctx);
  }

  private async take(email: InboundEmail, files: Fetched[]): Promise<number> {
    const { timeZone } = await this.directory.getSettings(email.cafeId);
    const today = await this.store.listInboundEmails(email.cafeId, { limit: 1000, since: startOfLocalDay(this.now(), timeZone) });
    let left = EMAIL_DOCUMENTS_PER_DAY - today.reduce((n, e) => n + e.documents.length, 0);
    for (const file of files) {
      const name = file.name;
      if ("why" in file || left <= 0) {
        email.skipped.push({ name, why: "why" in file ? file.why : "limit" });
        continue;
      }
      const r = await this.assistant.fromEmail(email.cafeId, { bytes: file.bytes, name }, { id: email.id, sender: email.sender });
      if ("skipped" in r) email.skipped.push({ name, why: r.skipped });
      else {
        email.documents.push({ documentId: r.documentId, name });
        left--;
      }
    }
    await this.store.saveInboundEmail(email);
    await this.store.addEvent({
      id: eventId(),
      cafeId: email.cafeId,
      at: this.now(),
      kind: "email.received",
      memberId: null,
      purpose: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ms: null,
      ok: true,
      detail: [email.sender, email.subject].filter(Boolean).join(" · ").slice(0, 300),
      draftId: null,
      documentId: email.documents[0]?.documentId ?? null,
      jobId: null,
    });
    return email.documents.length;
  }

  private async emailsDto(cafeId: string, emails: InboundEmail[]): Promise<InboundEmailDTO[]> {
    const oldest = emails.at(-1)?.receivedAt;
    const jobs = oldest ? await this.store.listJobs(cafeId, { kinds: ["document.read"], since: oldest }) : [];
    const out: InboundEmailDTO[] = [];
    for (const e of emails) {
      const documents: InboundEmailDTO["documents"] = [];
      for (const d of e.documents) {
        const draft = await this.store.getDraftByDocument(cafeId, d.documentId);
        const job = jobs.find((j) => j.payload.documentId === d.documentId);
        const state: InboundEmailDTO["documents"][number]["state"] = draft
          ? draft.status === "open"
            ? "waiting"
            : draft.status === "confirmed"
              ? "saved"
              : "dismissed"
          : job?.status === "failed"
            ? "failed"
            : job?.result?.notBill
              ? "notBill"
              : "reading";
        documents.push({ ...d, state, draftId: draft?.status === "open" ? draft.id : null });
      }
      out.push({ id: e.id, sender: e.sender, subject: e.subject, at: e.receivedAt.toISOString(), documents, skipped: e.skipped });
    }
    return out;
  }

  private async inbox(cafeId: string): Promise<CafeInbox> {
    const found = await this.store.getInbox(cafeId);
    if (found) return found;
    const now = this.now();
    const inbox = { cafeId, token: await this.freshToken(), enabled: true, createdAt: now, updatedAt: now };
    await this.store.saveInbox(inbox);
    return inbox;
  }

  private async freshToken(): Promise<string> {
    for (;;) {
      const token = newInboxToken((n) => randomBytes(n));
      if (!(await this.store.findInbox(token))) return token;
    }
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    throw ctx.rolePermissions.has(permission)
      ? new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403)
      : new AppError("FORBIDDEN", "Not allowed", 403);
  }
}

type Fetched = { name: string; bytes: Uint8Array } | { name: string; why: SkipReason };

/** The files worth reading, downloaded; the rest named with why. Cheap checks first, so a large or foreign file isn't even fetched. */
async function fetchFiles(files: MailFile[]): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (const [i, file] of files.entries()) {
    const name = (file.name || `ek-${i + 1}`).slice(0, 120);
    if (i >= FILES_PER_EMAIL) out.push({ name, why: "limit" });
    else if (file.size > MAX_DOCUMENT_BYTES) out.push({ name, why: "large" });
    else if (
      !/^(application\/pdf|image\/|application\/octet-stream|text\/csv|application\/vnd\.openxmlformats-officedocument\.spreadsheetml)/i.test(
        file.contentType,
      ) &&
      !/\.(pdf|jpe?g|png|webp|heic|csv|xlsx)$/i.test(name)
    ) {
      out.push({ name, why: "type" });
    } else out.push({ name, bytes: await file.read() });
  }
  return out;
}

/** "Moda Süt <e-fatura@modasut.test>" → "e-fatura@modasut.test". */
export function senderAddress(from: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) ?? /([^\s<>"]+@[^\s<>"]+)/.exec(from);
  return (m?.[1] ?? from).trim().toLowerCase().slice(0, 200);
}
