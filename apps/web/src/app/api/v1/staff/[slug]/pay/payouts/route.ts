import { payoutSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Öde": pay against a month. The same `key` pays once. Needs "pay.payouts". */
export const POST = route(async ({ app, req, staffToken }) => app.pay.payout(await app.staff.at(staffToken, segment(req, -3)), await body(req, payoutSchema)));
