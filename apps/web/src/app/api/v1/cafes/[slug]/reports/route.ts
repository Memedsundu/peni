import { reportSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Reports another member's comment or event to the café. */
export const POST = route(async ({ app, req, customer }) => app.report(customer!, segment(req, -2), await body(req, reportSchema)), { auth: "customer" });
