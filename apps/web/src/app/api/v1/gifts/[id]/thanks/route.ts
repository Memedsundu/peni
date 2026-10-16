import { route, segment } from "@/server/http";

/** "Teşekkür et": stored once; repeating it changes nothing. [G15] */
export const POST = route(async ({ app, req, customer }) => app.thankGift(customer!, segment(req, -2)), {
  auth: "customer",
});
