import { checkSampleSchema } from "@peni/api";
import { after } from "next/server";
import { body, route, segment } from "@/server/http";

/** Demo only: a sample bank or card statement, or a Z report, made from the demo café's numbers and read like an upload. */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -3));
  const result = await app.assistant.sample(ctx, (await body(req, checkSampleSchema)).kind);
  if (result.reading) after(() => app.assistant.runSoon());
  return result;
});
