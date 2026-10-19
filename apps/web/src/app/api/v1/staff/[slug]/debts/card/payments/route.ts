import { payCardSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Karta ödeme". The same `key` pays once. Needs "debts.card". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.payCard(await app.staff.at(staffToken, segment(req, -4)), await body(req, payCardSchema)),
);
