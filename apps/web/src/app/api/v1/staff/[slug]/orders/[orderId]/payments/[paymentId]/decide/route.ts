import { decidePaymentSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The yazarkasa stopped answering: the barista says, from what it printed, whether the payment went through. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.decidePayment(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2), await body(req, decidePaymentSchema)),
);
