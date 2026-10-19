import { route, segment } from "@/server/http";

/** The till's tabs and tiles: what can be sold right now. Needs "till.use". */
export const GET = route(async ({ app, req, staffToken }) => app.till.tillMenu(await app.staff.at(staffToken, segment(req, -2))));
