import { MAX_DOCUMENT_BYTES } from "@peni/core";
import { after } from "next/server";
import { AppError } from "@/server/errors";
import { route, segment } from "@/server/http";

/**
 * A photo or PDF of a bill, sent as it is (`?name=` the file's name). The assistant reads it
 * after the answer goes out; the draft shows up on Taslaklar. Needs "bills.add".
 */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -2));
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES) throw new AppError("DOCUMENT_TOO_LARGE", "Documents can be at most 10 MB", 413);
  const reading = await app.assistant.upload(ctx, new Uint8Array(await req.arrayBuffer()), new URL(req.url).searchParams.get("name") ?? "");
  after(() => app.assistant.runSoon());
  return reading;
});
