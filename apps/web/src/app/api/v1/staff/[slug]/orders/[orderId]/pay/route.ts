import { payOrderSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Nakit" or "Kart". The same `payKey` again answers as the first time. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.pay(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, payOrderSchema)),
);
