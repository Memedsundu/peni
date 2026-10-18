import { route, segment } from "@/server/http";

/** "Vardiyayı sil". Needs "shifts.edit". */
export const POST = route(async ({ app, req, staffToken }) => app.shifts.remove(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)));
