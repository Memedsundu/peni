import { cancelPaymentSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Backs out of a payment still waiting; `declined` when the terminal said no. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.cancelPayment(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2), await body(req, cancelPaymentSchema)),
);
