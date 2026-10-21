import { route, segment } from "@/server/http";

/** Takes back a penny code nobody has used yet. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.counter.cancel(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)),
);
