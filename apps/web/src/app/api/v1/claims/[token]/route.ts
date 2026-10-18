import { route, segment } from "@/server/http";

/** What the customer screen's QR opens. Public; personal once signed in. */
export const GET = route(async ({ app, req, customer }) => app.claimPreview(segment(req, -1), customer), { auth: "optional" });
