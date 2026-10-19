import { updatePostSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Changes only what was sent: the words, the photos or the pin. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.update(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1), await body(req, updatePostSchema)),
);
