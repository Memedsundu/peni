import { updateProductSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Changes only what was sent; `removed` takes it off the menu or brings it back. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.menuEditor.updateProduct(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), await body(req, updateProductSchema)),
);
