import { repayLenderSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Geri öde": pays a lender's oldest loans first. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.debts.repay(await app.staff.at(staffToken, segment(req, -3)), await body(req, repayLenderSchema)),
);
