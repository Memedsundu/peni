import { route, segment } from "@/server/http";

/** Borçlar: everything the café owes. Needs "debts.view". */
export const GET = route(async ({ app, req, staffToken }) => app.debts.get(await app.staff.at(staffToken, segment(req, -2))));
