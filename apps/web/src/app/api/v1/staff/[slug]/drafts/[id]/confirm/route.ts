import { confirmDraftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Onayla": adds the bill as checked, in the confirmer's name. Needs "assistant.use" and "bills.add". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.assistant.confirm(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, confirmDraftSchema)),
);
