import { takeClaimSchema } from "@peni/api";
import { body, route } from "@/server/http";

/** "Peni'yi al": the QR's token, or the 4-digit code typed for a café. */
export const POST = route(async ({ app, req, customer }) => app.takeClaim(customer!, await body(req, takeClaimSchema)), { auth: "customer" });
