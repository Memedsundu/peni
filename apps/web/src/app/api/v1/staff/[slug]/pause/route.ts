import { z } from "zod";
import { body, route, segment } from "@/server/http";

export const POST = route(
  async ({ app, req }) => {
    const { paused } = await body(req, z.object({ paused: z.boolean() }));
    return app.setPaused(segment(req, -2), paused);
  },
  { auth: "staff" },
);
