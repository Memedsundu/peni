import { route, segment } from "@/server/http";

/** The yazarkasa of the till computer the barista is at. */
export const GET = route(async ({ app, req, staffToken }) => app.yazarkasa.tillState(await app.staff.at(staffToken, segment(req, -2))));
