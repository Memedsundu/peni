import { after } from "next/server";
import { AppError } from "@/server/errors";
import { route } from "@/server/http";
import { ResendInbound, verifySvix, type ResendReceived } from "@/server/inbound-mail";

/**
 * Resend's inbound webhook (piece 26): an email reached a café's bill address. Set up in
 * Resend with the "email.received" event pointing here; RESEND_WEBHOOK_SECRET is the
 * webhook's signing secret and RESEND_API_KEY fetches the attachments. Unsigned or stale
 * requests are refused; anything else answers 200 so Resend doesn't retry it, except a
 * failure fetching attachments, which Resend then retries.
 */
export const POST = route(async ({ app, req }) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!secret || !apiKey) throw new AppError("INBOX_NOT_READY", "This server doesn't take email yet", 503);
  const raw = await req.text();
  const signed = verifySvix(
    secret,
    { id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") },
    raw,
    new Date(),
  );
  if (!signed) throw new AppError("UNAUTHENTICATED", "Not signed", 401);
  let event: ResendReceived;
  try {
    event = JSON.parse(raw) as ResendReceived;
  } catch {
    throw new AppError("VALIDATION", "Not JSON", 400);
  }
  const mail = new ResendInbound(apiKey).mail(event);
  const taken = mail ? await app.inbox.receive(mail) : 0;
  if (taken) after(() => app.assistant.runSoon());
  return { taken };
});
