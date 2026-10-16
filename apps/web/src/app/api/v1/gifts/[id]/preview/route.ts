import { route, segment } from "@/server/http";

/** Public gift landing data for /hediye/[id]; personalised when the visitor is signed in. [G11] */
export const GET = route(async ({ app, req, customer }) => app.giftPreview(segment(req, -2), customer));
