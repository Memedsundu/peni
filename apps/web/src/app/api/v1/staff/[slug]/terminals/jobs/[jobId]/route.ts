import { route, segment } from "@/server/http";

/** Where a report or test slip stands. */
export const GET = route(async ({ app, req, staffToken }) => app.yazarkasa.job(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1)));
