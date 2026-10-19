import { orderReasonSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "İade": a paid order, in full. Needs "till.correct" and a reason. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.refund(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, orderReasonSchema)),
);
