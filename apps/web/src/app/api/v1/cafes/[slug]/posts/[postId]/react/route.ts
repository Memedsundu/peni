import { route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req, customer }) => app.react(customer!, segment(req, -4), segment(req, -2)),
  { auth: "customer" },
);
