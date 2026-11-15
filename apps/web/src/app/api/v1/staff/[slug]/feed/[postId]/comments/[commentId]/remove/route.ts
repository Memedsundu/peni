import { route, segment } from "@/server/http";

/** Takes one of the café's replies back, for good. Needs "posts.write". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.removeReply(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2)),
);
