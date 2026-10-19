import { createEventSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** A member opens an event (D4). */
export const POST = route(async ({ app, req, customer }) => app.openEvent(customer!, segment(req, -2), await body(req, createEventSchema)), {
  auth: "customer",
});
