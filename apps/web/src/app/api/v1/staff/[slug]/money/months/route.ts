import { closeMonthSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Ay kapanışı: the closes, and the month that can be closed next. Needs "cash.manage". */
export const GET = route(async ({ app, req, staffToken }) => app.money.months(await app.staff.at(staffToken, segment(req, -3))));

/** "Ayı kapat". Needs "cash.periods" (the owner). */
export const POST = route(async ({ app, req, staffToken }) =>
  app.money.closeMonth(await app.staff.at(staffToken, segment(req, -3)), await body(req, closeMonthSchema)),
);
