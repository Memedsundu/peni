import { route, segment } from "@/server/http";

/** Takes back a rate that starts in an open pay month. Needs "pay.hours". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.pay.removeRate(await app.staff.at(staffToken, segment(req, -5)), new URL(req.url).searchParams.get("month") ?? "", segment(req, -2)),
);
