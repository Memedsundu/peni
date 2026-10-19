import { checkDraftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Kontrol edildi" on a statement or Z report (piece 27). Needs "assistant.use" and "cash.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.assistant.check(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, checkDraftSchema)),
);
