import { route, segment } from "@/server/http";

/** "Reçeteyi asistan yazsın": a draft for a product with no recipe; a person confirms it (D21). */
export const POST = route(async ({ app, req, staffToken }) =>
  app.recipeDrafts.draft(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)),
);
