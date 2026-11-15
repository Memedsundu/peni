import { createPostSchema } from "@peni/api";
import { z } from "zod";
import { body, route, segment } from "@/server/http";

/**
 * Topluluk: the café's own feed, hidden comments included for moderators (plan piece 14).
 * `?limit=` asks for more than the newest 30 posts; more than 500 reads as 500.
 */
export const GET = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -2));
  return app.feed.view(ctx, z.coerce.number().int().positive().optional().parse(req.nextUrl.searchParams.get("limit") ?? undefined));
});

/** A new post with words, photos or both. The same `createKey` again posts once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.create(await app.staff.at(staffToken, segment(req, -2)), await body(req, createPostSchema)),
);
