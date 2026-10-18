import { route, segment } from "@/server/http";

/** Takes back the viewer's own comment, for good. */
export const POST = route(
  async ({ app, req, customer }) => app.deleteComment(customer!, segment(req, -6), segment(req, -4), segment(req, -2)),
  { auth: "customer" },
);
