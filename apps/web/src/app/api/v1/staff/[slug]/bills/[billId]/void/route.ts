import { voidBillSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "İptal et": its stock goes back out and it stops counting as owed. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.void(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, voidBillSchema)),
);
