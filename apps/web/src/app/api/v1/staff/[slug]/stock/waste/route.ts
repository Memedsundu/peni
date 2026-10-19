import { wasteStockSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Fire": how much went to waste, and why. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.stock.waste(await app.staff.at(staffToken, segment(req, -3)), await body(req, wasteStockSchema)),
);
