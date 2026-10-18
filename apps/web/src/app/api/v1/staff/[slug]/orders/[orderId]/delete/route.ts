import { orderReasonSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Sil": hidden from lists and reports, kept on record. Needs "till.delete" and a reason. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.remove(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, orderReasonSchema)),
);
