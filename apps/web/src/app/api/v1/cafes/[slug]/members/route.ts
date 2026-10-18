import { cafeMembersQuerySchema } from "@peni/api";
import { route, segment } from "@/server/http";

/** "Kafenin üyeleri": members who show their profile, to pick whom to treat; `?q=` searches names. [D28] */
export const GET = route(
  async ({ app, req, customer }) => {
    const { q } = cafeMembersQuerySchema.parse({ q: req.nextUrl.searchParams.get("q") ?? undefined });
    return app.cafeMembers(customer!, segment(req, -2), q);
  },
  { auth: "customer" },
);
