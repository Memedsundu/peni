import { addLoanSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Money someone put in. The same `key` adds it once. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.addLoan(await app.staff.at(staffToken, segment(req, -3)), await body(req, addLoanSchema)),
);
