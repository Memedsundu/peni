import { route, segment } from "@/server/http";

/** "Geri al": the sender takes back a pending gift. [G17] */
export const POST = route(async ({ app, req, customer }) => app.cancelGift(customer!, segment(req, -2)), {
  auth: "customer",
});
