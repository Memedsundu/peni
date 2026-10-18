import { after } from "next/server";
import { route, segment } from "@/server/http";

/** Taslaklar: open drafts, recent decisions, documents being read. Needs "assistant.use". Runs whatever is waiting afterwards. */
export const GET = route(async ({ app, req, staffToken }) => {
  const drafts = await app.assistant.list(await app.staff.at(staffToken, segment(req, -2)));
  after(() => app.assistant.runSoon());
  return drafts;
});
