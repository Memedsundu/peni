import { MAX_AUDIO_BYTES } from "@peni/core";
import { AppError } from "@/server/errors";
import { route, segment } from "@/server/http";

/**
 * A short recording for quick entry (piece 28), sent as it is (`?lang=tr|en`). Answers with
 * what was heard, for the person to fix and send; the recording isn't kept. Needs "bills.add".
 */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -3));
  if (Number(req.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) throw new AppError("AUDIO_TOO_LARGE", "Speak for at most a minute", 413);
  const lang = new URL(req.url).searchParams.get("lang") === "en" ? "en" : "tr";
  return app.assistant.hear(ctx, new Uint8Array(await req.arrayBuffer()), lang);
});
