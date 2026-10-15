import { route, segment } from "@/server/http";

export const POST = route(async ({ app, req, customer }) => app.join(segment(req, -2), customer!), { auth: "customer" });
