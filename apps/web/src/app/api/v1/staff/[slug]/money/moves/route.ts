import { moneyMoveSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Aktar", "Para koy", "Para çek", "Düzelt". The same `key` moves once. Needs "cash.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.money.move(await app.staff.at(staffToken, segment(req, -3)), await body(req, moneyMoveSchema)),
);
