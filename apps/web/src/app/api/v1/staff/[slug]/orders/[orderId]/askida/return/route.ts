import { route, segment } from "@/server/http";

/** "Askıya geri koy": what the askı paid for on an unpaid order goes back to it. */
export const POST = route(async ({ app, req, staffToken }) => app.till.returnAskida(await app.staff.at(staffToken, segment(req, -5)), segment(req, -3)));
