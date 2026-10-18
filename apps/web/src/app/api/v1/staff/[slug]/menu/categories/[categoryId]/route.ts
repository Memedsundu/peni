import { menuCategorySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Renames a category. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.menuEditor.renameCategory(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), await body(req, menuCategorySchema)),
);
