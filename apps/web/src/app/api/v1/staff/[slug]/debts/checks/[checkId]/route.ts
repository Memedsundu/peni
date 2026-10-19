import { cashCheckSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Tahsil edildi", or undo it. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.cashCheck(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), await body(req, cashCheckSchema)),
);
