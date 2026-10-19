import { payBillSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Öde": all or part of what is left. Credit, check and loan move it to Borçlar. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.pay(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, payBillSchema)),
);
