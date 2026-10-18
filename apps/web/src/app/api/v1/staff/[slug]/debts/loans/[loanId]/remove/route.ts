import { route, segment } from "@/server/http";

/** A loan typed by mistake; not one a bill payment made. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) => app.debts.removeLoan(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
