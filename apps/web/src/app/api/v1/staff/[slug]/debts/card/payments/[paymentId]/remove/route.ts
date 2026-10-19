import { route, segment } from "@/server/http";

/** Undo a card payment. Needs "debts.card". */
export const POST = route(async ({ app, req, staffToken }) => app.debts.removeCardPayment(await app.staff.at(staffToken, segment(req, -6)), segment(req, -2)));
