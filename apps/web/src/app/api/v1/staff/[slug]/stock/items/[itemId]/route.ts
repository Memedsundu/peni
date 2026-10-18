import { updateStockItemSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** One item and every move it had, sales included. */
export const GET = route(async ({ app, req, staffToken }) => app.stock.history(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1)));

/** Changes only what was sent; `removed` takes it off Stok or brings it back. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.stock.updateItem(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), await body(req, updateStockItemSchema)),
);
