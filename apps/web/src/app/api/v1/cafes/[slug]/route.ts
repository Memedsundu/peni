import { route, segment } from "@/server/http";

export const GET = route(async ({ app, req, customer }) => app.cafeDetail(segment(req, -1), customer));
