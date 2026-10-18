import { reopenMonthSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Yeniden aç": the last closed month, with why. Needs "cash.periods". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.money.reopen(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2), await body(req, reopenMonthSchema)),
);
