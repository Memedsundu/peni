import { route, segment } from "@/server/http";

/** Nakit ve banka: the drawer, the reserve and the bank. Needs "cash.manage". */
export const GET = route(async ({ app, req, staffToken }) => app.money.get(await app.staff.at(staffToken, segment(req, -2))));
