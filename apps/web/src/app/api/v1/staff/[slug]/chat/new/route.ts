import { route, segment } from "@/server/http";

/** "Yeni sohbet": the next question starts a new conversation (piece 29). */
export const POST = route(async ({ app, req, staffToken }) => app.chat.fresh(await app.staff.at(staffToken, segment(req, -3))));
