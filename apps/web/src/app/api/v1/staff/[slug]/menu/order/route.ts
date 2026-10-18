import { menuOrderSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) =>
  app.menuEditor.reorder(await app.staff.at(staffToken, segment(req, -3)), await body(req, menuOrderSchema)),
);
