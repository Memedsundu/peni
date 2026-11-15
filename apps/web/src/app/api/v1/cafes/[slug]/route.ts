import { route, segment } from "@/server/http";

/** The café with its feed's first page; `?post=<id>` puts that one post alone in the feed, with every comment. */
export const GET = route(async ({ app, req, customer }) =>
  app.cafeDetail(segment(req, -1), customer, { post: req.nextUrl.searchParams.get("post") }),
);
