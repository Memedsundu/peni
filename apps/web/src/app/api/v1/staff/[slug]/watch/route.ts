import { route, segment } from "@/server/http";

export const maxDuration = 30;

/** Gözcü (piece 31): prices, unusual activity, the next 30 days' money, what to order, staffing. Needs "reports.view". */
export const GET = route(async ({ app, req, staffToken }) => app.watch.get(await app.staff.at(staffToken, segment(req, -2))));
