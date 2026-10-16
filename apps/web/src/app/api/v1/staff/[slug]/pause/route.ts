import { pauseSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** `{ paused: boolean }` as before, or `{ pause: { minutes } | "end_of_day" | null }` with auto-resume. [G20] */
export const POST = route(
  async ({ app, req }) => {
    const input = await body(req, pauseSchema);
    return app.setPaused(segment(req, -2), "paused" in input ? input.paused : input.pause);
  },
  { auth: "staff" },
);
