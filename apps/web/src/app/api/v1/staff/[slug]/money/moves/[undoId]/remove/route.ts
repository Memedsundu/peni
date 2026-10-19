import { route, segment } from "@/server/http";

/** "Geri al" on a movement made on Nakit ve banka. Needs "cash.manage". */
export const POST = route(async ({ app, req, staffToken }) => app.money.undo(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
