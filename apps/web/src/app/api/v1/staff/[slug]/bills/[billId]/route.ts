import { correctBillSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** One bill with its lines and payments. Needs "bills.view". */
export const GET = route(async ({ app, req, staffToken }) => app.bills.get(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1)));

/** "Düzelt": the whole bill again, with the version it was read at. Stock moves by the difference. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.bills.correct(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1), await body(req, correctBillSchema)),
);
