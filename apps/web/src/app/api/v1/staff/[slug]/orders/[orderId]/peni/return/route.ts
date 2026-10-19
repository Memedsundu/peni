import { route, segment } from "@/server/http";

/** "Peni'yi geri ver": the peni on an unpaid order go back to the wallet. */
export const POST = route(async ({ app, req, staffToken }) => app.till.returnPeni(await app.staff.at(staffToken, segment(req, -5)), segment(req, -3)));
