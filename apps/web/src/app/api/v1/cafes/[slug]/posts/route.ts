import { route, segment } from "@/server/http";

/** The next page of older posts: `?before=` is the `olderPosts` the page before came with. Public, like the café. */
export const GET = route(async ({ app, req, customer }) =>
  app.olderPosts(segment(req, -2), customer, req.nextUrl.searchParams.get("before") ?? ""),
);
