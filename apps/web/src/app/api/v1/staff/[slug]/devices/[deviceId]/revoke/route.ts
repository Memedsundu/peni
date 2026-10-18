import { route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) =>
  app.staff.revokeDevice(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)),
);
