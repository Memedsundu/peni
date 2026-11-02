import { route, segment } from "@/server/http";

/** Where the till's X or Z report stands. */
export const GET = route(async ({ app, req, staffToken }) => app.yazarkasa.tillJob(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1)));
