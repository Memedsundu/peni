import { route, segment } from "@/server/http";

export const GET = route(async ({ app, req, customer }) => app.orderFor(customer!, segment(req, -1)), { auth: "customer" });
