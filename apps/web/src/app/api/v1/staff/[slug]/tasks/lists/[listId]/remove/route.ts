import { route, segment } from "@/server/http";

/** "Listeyi kaldır": not due from today, history kept. Needs "tasks.edit". */
export const POST = route(async ({ app, req, staffToken }) => app.tasks.removeList(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
