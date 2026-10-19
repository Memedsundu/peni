import { route, segment } from "@/server/http";

/** Stok in the café panel: items worst first, removed ones, and the latest counts and waste. Needs "stock.view". */
export const GET = route(async ({ app, req, staffToken }) => app.stock.view(await app.staff.at(staffToken, segment(req, -2))));
