import { resetStaffPasswordSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) => {
  const { password } = await body(req, resetStaffPasswordSchema);
  return app.staff.resetPassword(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), password);
});
