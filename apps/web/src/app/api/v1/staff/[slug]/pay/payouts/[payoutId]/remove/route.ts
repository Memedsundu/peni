import { route, segment } from "@/server/http";

/** Takes a payout back, with its money. Needs "pay.payouts". */
export const POST = route(async ({ app, req, staffToken }) => app.pay.removePayout(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2)));
