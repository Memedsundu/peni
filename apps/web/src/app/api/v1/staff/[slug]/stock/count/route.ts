import { countStockSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Sayım": what is there now, for one item or many. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.stock.count(await app.staff.at(staffToken, segment(req, -3)), await body(req, countStockSchema)),
);
