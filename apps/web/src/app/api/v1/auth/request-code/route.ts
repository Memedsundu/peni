import { requestCodeSchema } from "@peni/api";
import { body, route } from "@/server/http";

export const POST = route(async ({ app, req }) => {
  const { phone } = await body(req, requestCodeSchema);
  return app.requestCode(phone);
});
