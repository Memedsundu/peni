import { route, segment } from "@/server/http";

/** The café's peni and askı numbers. */
export const GET = route(async ({ app, req, staffToken }) =>
  app.staffDashboard(await app.staff.at(staffToken, segment(req, -1), "peni.view")),
);
