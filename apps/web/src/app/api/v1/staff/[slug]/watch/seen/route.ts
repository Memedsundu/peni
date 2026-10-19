import { watchSeenSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const maxDuration = 30;

/** "Gördüm": a price or an unusual finding is let go, for everyone at the café. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.watch.dismiss(await app.staff.at(staffToken, segment(req, -3)), await body(req, watchSeenSchema)),
);
