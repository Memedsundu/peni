import { route, segment } from "@/server/http";

/** "Bağlantıyı kaldır": the bridge stops working; the till takes payments by hand. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.yazarkasa.disconnect(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)),
);
