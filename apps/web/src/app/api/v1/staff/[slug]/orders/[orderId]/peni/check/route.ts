import { checkPeniSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Whose wallet the customer's ödeme kodu opens, and how much can go on the order. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.checkPeni(await app.staff.at(staffToken, segment(req, -5)), segment(req, -3), await body(req, checkPeniSchema)),
);
