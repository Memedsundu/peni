import { pennySpendSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Takes pennies off the wallet for a bill paid on the café's own till. The same `key` again takes them once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.counter.spend(await app.staff.at(staffToken, segment(req, -3)), await body(req, pennySpendSchema)),
);
