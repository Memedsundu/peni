import { pauseMemberSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Pauses a member in the community, or lets them back. Needs "posts.moderate". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.pauseMember(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), (await body(req, pauseMemberSchema)).paused),
);
