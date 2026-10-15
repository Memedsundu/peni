import { route, segment } from "@/server/http";

export const POST = route(async ({ app, req, customer }) => app.resolveGift(customer!, segment(req, -2), "decline"), {
  auth: "customer",
});
