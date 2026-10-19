import { setPinSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Sets the caller's own till PIN at this café. Needs a password sign-in. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.staff.setPin(await app.staff.at(staffToken, segment(req, -2)), (await body(req, setPinSchema)).pin),
);
