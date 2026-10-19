import { chatAskSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The model may look a few times before it answers. */
export const maxDuration = 60;

/** The person's conversation with the assistant (piece 29). Needs "assistant.use". */
export const GET = route(async ({ app, req, staffToken }) => app.chat.current(await app.staff.at(staffToken, segment(req, -2))));

/** A question, answered before this returns; "Açıkla" sends what it's about. The same key twice asks once. */
export const POST = route(async ({ app, req, staffToken }) => app.chat.ask(await app.staff.at(staffToken, segment(req, -2)), await body(req, chatAskSchema)));
