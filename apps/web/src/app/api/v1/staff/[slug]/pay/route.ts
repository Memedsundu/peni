import { route, segment } from "@/server/http";

/** Puantaj ve maaş for a month (`?month=`, this one when left out). Anyone on the team sees their own. */
export const GET = route(async ({ app, req, staffToken }) =>
  app.pay.month(await app.staff.at(staffToken, segment(req, -2)), new URL(req.url).searchParams.get("month") ?? undefined),
);
