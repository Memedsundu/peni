import { body, route, segment } from "@/server/http";
import { z } from "zod";

const schema = z.object({ hidden: z.boolean() });

/** Hides a comment, or brings it back. Needs "posts.moderate". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.setCommentHidden(await app.staff.at(staffToken, segment(req, -5)), segment(req, -3), segment(req, -1), (await body(req, schema)).hidden),
);
