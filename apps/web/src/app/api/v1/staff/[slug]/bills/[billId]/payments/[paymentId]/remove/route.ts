import { route, segment } from "@/server/http";

/** "Geri al" on one payment, with the check or debt it made. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.removePayment(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2)),
);
