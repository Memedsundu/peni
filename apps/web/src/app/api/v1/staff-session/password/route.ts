import { changePasswordSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** Changes the caller's password and signs them out on every other device. */
export const POST = route(async ({ app, req, staffToken }) => {
  const { currentPassword, newPassword } = await body(req, changePasswordSchema);
  return app.staff.changePassword(staffToken, currentPassword, newPassword);
});
