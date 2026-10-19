import { route, segment } from "@/server/http";

/** Takes the post down: gone from the feed, kept on record. */
export const POST = route(async ({ app, req, staffToken }) => app.feed.remove(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)));
