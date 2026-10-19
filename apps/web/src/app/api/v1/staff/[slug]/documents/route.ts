import { MAX_DOCUMENT_BYTES } from "@peni/core";
import { after } from "next/server";
import { AppError } from "@/server/errors";
import { route, segment } from "@/server/http";

/**
 * A photo or PDF of a bill, sent as it is (`?name=` the file's name). The assistant reads it
 * after the answer goes out; the draft shows up on Taslaklar. The same file again is only
 * read with `?again=1`. Needs "bills.add".
 */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -2));
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES) throw new AppError("DOCUMENT_TOO_LARGE", "Documents can be at most 10 MB", 413);
  const query = new URL(req.url).searchParams;
  const result = await app.assistant.upload(ctx, new Uint8Array(await req.arrayBuffer()), query.get("name") ?? "", { again: query.get("again") === "1" });
  if (result.reading) after(() => app.assistant.runSoon());
  return result;
});
