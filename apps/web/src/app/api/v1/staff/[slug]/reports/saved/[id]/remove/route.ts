import { route, segment } from "@/server/http";

/** Takes a saved report off Raporlar (piece 29). Needs "reports.view". */
export const POST = route(async ({ app, req, staffToken }) => app.chat.remove(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
