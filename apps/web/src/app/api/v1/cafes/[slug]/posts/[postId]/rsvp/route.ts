import { route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req, customer }) => app.rsvp(customer!, segment(req, -4), segment(req, -2)),
  { auth: "customer" },
);
