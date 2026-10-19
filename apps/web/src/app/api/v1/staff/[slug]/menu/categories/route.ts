import { menuCategorySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) =>
  app.menuEditor.addCategory(await app.staff.at(staffToken, segment(req, -3)), await body(req, menuCategorySchema)),
);
