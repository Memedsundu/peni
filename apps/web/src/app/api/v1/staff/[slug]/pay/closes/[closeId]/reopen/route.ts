import { reopenMonthSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Yeniden aç": the latest pay close, with a reason. Needs "pay.close". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.pay.reopen(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2), await body(req, reopenMonthSchema)),
);
