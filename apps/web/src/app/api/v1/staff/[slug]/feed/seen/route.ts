import { route, segment } from "@/server/http";

/** Someone on the staff looked at Topluluk: Bugün stops counting what came before as new. */
export const POST = route(async ({ app, req, staffToken }) => app.feed.markSeen(await app.staff.at(staffToken, segment(req, -3))));
