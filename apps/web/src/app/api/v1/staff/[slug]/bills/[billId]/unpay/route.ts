import { route, segment } from "@/server/http";

/** "Ödemeyi geri al": marked paid by mistake. Needs "bills.manage". */
export const POST = route(async ({ app, req, staffToken }) => app.bills.unpay(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2)));
