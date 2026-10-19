import { route, segment } from "@/server/http";

/** Undo a repayment. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) => app.debts.removeRepayment(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
