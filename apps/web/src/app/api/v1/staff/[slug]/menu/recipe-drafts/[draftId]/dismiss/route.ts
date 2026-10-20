import { dismissRecipeDraftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Taslağı bırak": the product stays as it was. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.recipeDrafts.dismiss(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2), await body(req, dismissRecipeDraftSchema)),
);
