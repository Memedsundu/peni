import { route, segment } from "@/server/http";

export const GET = route(async ({ app, req }) => app.staffDashboard(segment(req, -1)), { auth: "staff" });
