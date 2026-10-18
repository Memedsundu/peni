import { cardSettingsSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The credit card's name, limit, statement and due days. Needs "debts.card". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.setCard(await app.staff.at(staffToken, segment(req, -3)), await body(req, cardSettingsSchema)),
);
