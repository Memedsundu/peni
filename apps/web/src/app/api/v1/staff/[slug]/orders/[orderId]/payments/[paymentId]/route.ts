import { route, segment } from "@/server/http";

/** Where a payment stands: the till asks while the terminal works. */
export const GET = route(async ({ app, req, staffToken }) =>
  app.till.payment(await app.staff.at(staffToken, segment(req, -5)), segment(req, -3), segment(req, -1)),
);
