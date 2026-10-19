import { route, segment } from "@/server/http";

/** "Kayıt": the assistant's log, newest first; `?before=` pages back. Needs "assistant.use". */
export const GET = route(async ({ app, req, staffToken }) =>
  app.assistant.log(await app.staff.at(staffToken, segment(req, -3)), new URL(req.url).searchParams.get("before") ?? undefined),
);
