import { dismissDraftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Vazgeç": the draft is kept for the log, nothing is added. Needs "assistant.use". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.assistant.dismiss(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, dismissDraftSchema)),
);
