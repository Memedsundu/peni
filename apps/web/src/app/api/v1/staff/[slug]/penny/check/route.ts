import { pennyCheckSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Whose wallet the customer's ödeme kodu opens, and how much of the bill pennies can pay. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.counter.check(await app.staff.at(staffToken, segment(req, -3)), await body(req, pennyCheckSchema)),
);
