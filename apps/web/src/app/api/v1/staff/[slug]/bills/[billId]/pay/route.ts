import { payBillSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Ödendi": what is left of the bill, by cash, card or bank transfer. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.pay(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, payBillSchema)),
);
