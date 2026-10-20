import { confirmRecipeDraftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Reçeteyi onayla": the draft as the person left it becomes the product's recipe. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.recipeDrafts.confirm(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2), await body(req, confirmRecipeDraftSchema)),
);
