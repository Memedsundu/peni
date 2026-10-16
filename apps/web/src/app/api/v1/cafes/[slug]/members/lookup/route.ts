import { memberLookupSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Gift recipient check: { firstName, lastInitial } or 404. Rate-limited per customer. [G6] */
export const POST = route(
  async ({ app, req, customer }) => {
    const { phone } = await body(req, memberLookupSchema);
    return app.lookupMember(customer!, segment(req, -3), phone);
  },
  { auth: "customer" },
);
