import { memberLookupSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Gift recipient check by phone or Peni kodu: { firstName, lastInitial } or 404. Rate-limited per customer. [G6, D28] */
export const POST = route(
  async ({ app, req, customer }) => {
    const { phone, code } = await body(req, memberLookupSchema);
    return app.lookupMember(customer!, segment(req, -3), code !== undefined ? { code } : { phone: phone! });
  },
  { auth: "customer" },
);
