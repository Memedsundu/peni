import { updateOrderSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const GET = route(async ({ app, req, staffToken }) =>
  app.till.get(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1)),
);

/** Changes an open order's lines or discount. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.update(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1), await body(req, updateOrderSchema)),
);
