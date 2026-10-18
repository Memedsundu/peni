import { route, segment } from "@/server/http";

/** The askı as the till sees it: the pool and how many of each askı item it pays for (plan piece 13). */
export const GET = route(async ({ app, req, staffToken }) => app.till.tillAskida(await app.staff.at(staffToken, segment(req, -2))));
