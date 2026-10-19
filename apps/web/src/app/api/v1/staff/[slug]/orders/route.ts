import { createOrderSchema, orderListQuerySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Satışlar": one day's orders with the day's sums; `?day=YYYY-MM-DD&status=`. Needs "till.history". */
export const GET = route(async ({ app, req, staffToken }) => {
  const params = req.nextUrl.searchParams;
  const query = orderListQuerySchema.parse({ day: params.get("day") ?? undefined, status: params.get("status") ?? undefined });
  return app.till.list(await app.staff.at(staffToken, segment(req, -2)), { businessDay: query.day, status: query.status });
});

/** Starts an order when the barista goes to pay. The same `createKey` returns the same order. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.create(await app.staff.at(staffToken, segment(req, -2)), await body(req, createOrderSchema)),
);
