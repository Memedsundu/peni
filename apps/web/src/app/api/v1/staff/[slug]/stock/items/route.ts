import { addStockItemSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Malzeme ekle", with what is there now. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.stock.addItem(await app.staff.at(staffToken, segment(req, -3)), await body(req, addStockItemSchema)),
);
