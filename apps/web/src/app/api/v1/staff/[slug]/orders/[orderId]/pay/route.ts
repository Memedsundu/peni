import { payOrderSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Nakit" or "Kart": starts a payment through the till's terminal. The same `payKey` again answers with the same payment. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.pay(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, payOrderSchema)),
);
