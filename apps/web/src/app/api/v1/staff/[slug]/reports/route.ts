import { route, segment } from "@/server/http";

/** Raporlar: `?from=&through=` (local days, inclusive; this month so far when left out). Needs "reports.view". */
export const GET = route(async ({ app, req, staffToken }) => {
  const q = new URL(req.url).searchParams;
  return app.salesReports.get(await app.staff.at(staffToken, segment(req, -2)), { from: q.get("from") ?? undefined, through: q.get("through") ?? undefined });
});
