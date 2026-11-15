import { replySchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The café answers a member's comment, in its own name; the same `replyKey` again answers once. Needs "posts.write". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.reply(await app.staff.at(staffToken, segment(req, -6)), segment(req, -4), segment(req, -2), await body(req, replySchema)),
);
