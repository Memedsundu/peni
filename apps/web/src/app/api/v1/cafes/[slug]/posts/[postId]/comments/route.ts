import { commentSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req, customer }) => {
    const { body: text } = await body(req, commentSchema);
    return app.comment(customer!, segment(req, -4), segment(req, -2), text);
  },
  { auth: "customer" },
);
