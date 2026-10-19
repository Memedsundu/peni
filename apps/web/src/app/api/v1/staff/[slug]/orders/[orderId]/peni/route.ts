import { usePeniSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Takes peni from the wallet the customer's ödeme kodu opens, as a payment. The same `payKey` again takes them once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.usePeni(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, usePeniSchema)),
);
