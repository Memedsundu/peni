import { addCheckSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** A check written on its own. The same `key` adds it once. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.addCheck(await app.staff.at(staffToken, segment(req, -3)), await body(req, addCheckSchema)),
);
