import { route, segment } from "@/server/http";

/** The Cihazlar page: till computers and their yazarkasa (N12). Needs "devices.manage". */
export const GET = route(async ({ app, req, staffToken }) => app.yazarkasa.page(await app.staff.at(staffToken, segment(req, -2))));
