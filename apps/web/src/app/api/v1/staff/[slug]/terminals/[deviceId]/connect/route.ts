import { route, segment } from "@/server/http";

/** A one-time code to connect this computer's bridge; connecting again replaces the old connection. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.yazarkasa.connect(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)),
);
