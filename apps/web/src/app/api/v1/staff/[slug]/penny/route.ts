import { route, segment } from "@/server/http";

/** The penny screen (N11): today's codes from it, the café's penny rules and the askı. Needs "peni.till". */
export const GET = route(async ({ app, req, staffToken }) => app.counter.view(await app.staff.at(staffToken, segment(req, -2))));
