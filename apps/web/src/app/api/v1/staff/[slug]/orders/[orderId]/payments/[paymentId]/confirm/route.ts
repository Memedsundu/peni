import { route, segment } from "@/server/http";

/** "Onaylandı": the barista saw the terminal approve it. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.confirmPayment(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2)),
);
