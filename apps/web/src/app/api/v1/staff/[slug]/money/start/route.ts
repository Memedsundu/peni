import { startMoneySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Başla": what the reserve and the bank hold today. Once. Needs "cash.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.money.start(await app.staff.at(staffToken, segment(req, -3)), await body(req, startMoneySchema)),
);
