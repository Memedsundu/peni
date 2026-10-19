import { route, segment } from "@/server/http";

/** The host calls their event off. */
export const POST = route(async ({ app, req, customer }) => app.cancelEvent(customer!, segment(req, -4), segment(req, -2)), { auth: "customer" });
