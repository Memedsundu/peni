import { route, segment } from "@/server/http";

/** One post with every comment, for "Önceki yorumları göster". Public, like the café. */
export const GET = route(async ({ app, req, customer }) => app.cafePost(segment(req, -3), segment(req, -1), customer));
