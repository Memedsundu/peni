import { route, segment } from "@/server/http";

/** Müdavimler (piece 32): community insights for ?month=YYYY-MM (this month by default). Needs "reports.view". */
export const GET = route(async ({ app, req, staffToken }) =>
  app.insights.get(await app.staff.at(staffToken, segment(req, -2)), new URL(req.url).searchParams.get("month") ?? undefined),
);
