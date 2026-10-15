import { route, segment } from "@/server/http";

export const POST = route(async ({ app, req, customer }) => app.cancelOrder(customer!, segment(req, -2)), {
  auth: "customer",
});
