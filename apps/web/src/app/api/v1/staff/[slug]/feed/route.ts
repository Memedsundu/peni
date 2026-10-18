import { createPostSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Topluluk: the café's own feed, hidden comments included for moderators (plan piece 14). */
export const GET = route(async ({ app, req, staffToken }) => app.feed.view(await app.staff.at(staffToken, segment(req, -2))));

/** A new post with words, photos or both. The same `createKey` again posts once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.create(await app.staff.at(staffToken, segment(req, -2)), await body(req, createPostSchema)),
);
