import { staffTransitionSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req }) => {
    const { action, reason } = await body(req, staffTransitionSchema);
    return app.staffTransition(segment(req, -3), segment(req, -1), action, reason);
  },
  { auth: "staff" },
);
