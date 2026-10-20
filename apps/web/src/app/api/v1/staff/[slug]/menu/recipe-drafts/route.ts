import { route, segment } from "@/server/http";

/** The assistant's open recipe drafts, and the products with no recipe yet. Needs "menu.recipes". */
export const GET = route(async ({ app, req, staffToken }) => app.recipeDrafts.list(await app.staff.at(staffToken, segment(req, -3))));
