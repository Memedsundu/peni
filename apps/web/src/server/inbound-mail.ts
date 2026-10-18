import { createHmac, timingSafeEqual } from "node:crypto";
import type { Mail, MailFile } from "./inbox";

/** Svix's window: a signed request older or newer than this is refused (a replay). */
const TOLERANCE_S = 5 * 60;

/**
 * Checks a webhook the way Svix signs them (Resend's webhooks do): an HMAC-SHA256 of
 * "<svix-id>.<svix-timestamp>.<raw body>" keyed with the secret after "whsec_", in base64,
 * among the space-separated "v1,<signature>" entries of svix-signature.
 */
export function verifySvix(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: Date,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** The fields of Resend's "email.received" event that the inbox reads. */
export interface ResendReceived {
  type: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    received_for?: string[];
    subject?: string;
  };
}

/**
 * Resend's inbound email (piece 26): the webhook says an email arrived; its attachments
 * are listed with short-lived download links by the Received emails API.
 */
export class ResendInbound {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** The email in a webhook, or null for any other event. */
  mail(event: ResendReceived): Mail | null {
    const d = event.data;
    if (event.type !== "email.received" || !d?.email_id) return null;
    const emailId = d.email_id;
    return {
      providerId: emailId,
      from: d.from ?? "",
      recipients: [...(d.to ?? []), ...(d.cc ?? []), ...(d.received_for ?? [])],
      subject: d.subject ?? "",
      files: () => this.attachments(emailId),
    };
  }

  private async attachments(emailId: string): Promise<MailFile[]> {
    const res = await this.fetchFn(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status} for the attachments of ${emailId}`);
    const list = (await res.json()) as { data?: { filename?: string; content_type?: string; size?: number; download_url?: string }[] };
    return (list.data ?? []).map((a) => ({
      name: a.filename ?? "",
      contentType: a.content_type ?? "application/octet-stream",
      size: a.size ?? 0,
      read: async () => {
        const file = await this.fetchFn(a.download_url ?? "");
        if (!file.ok) throw new Error(`The attachment ${a.filename ?? ""} couldn't be downloaded (${file.status})`);
        return new Uint8Array(await file.arrayBuffer());
      },
    }));
  }
}
