import { route, segment } from "@/server/http";

/** A check typed by mistake; not one a bill payment wrote. Needs "debts.edit". */
export const POST = route(async ({ app, req, staffToken }) => app.debts.removeCheck(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
