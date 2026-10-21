import { pennyGiveSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** A penny code for what the customer paid on the café's own till. The same `key` again gives the same code. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.counter.give(await app.staff.at(staffToken, segment(req, -3)), await body(req, pennyGiveSchema)),
);
