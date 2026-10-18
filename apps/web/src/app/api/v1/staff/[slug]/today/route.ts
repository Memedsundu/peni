import { route, segment } from "@/server/http";

/** Bugün: what needs doing (as far as the viewer's role sees) and today's tasks. Any staff member. */
export const GET = route(async ({ app, req, staffToken }) => app.alerts.today(await app.staff.at(staffToken, segment(req, -2))));
