import { route, segment } from "@/server/http";

/** Kasa: the open drawer, or the last one closed. */
export const GET = route(async ({ app, req, staffToken }) => app.cash.state(await app.staff.at(staffToken, segment(req, -2))));
