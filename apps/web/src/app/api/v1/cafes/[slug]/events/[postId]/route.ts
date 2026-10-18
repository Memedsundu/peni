import { updateEventSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The host changes their event. */
export const POST = route(
  async ({ app, req, customer }) => app.updateEvent(customer!, segment(req, -3), segment(req, -1), await body(req, updateEventSchema)),
  { auth: "customer" },
);
