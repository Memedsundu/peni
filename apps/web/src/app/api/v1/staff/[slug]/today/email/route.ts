import { alertEmailSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The morning email for the viewer, on or off. */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -3));
  return app.alerts.setEmail(ctx, (await body(req, alertEmailSchema)).on);
});
