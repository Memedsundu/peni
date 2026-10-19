import { route, segment } from "@/server/http";

/** Deletes an empty category. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.menuEditor.deleteCategory(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)),
);
