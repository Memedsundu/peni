import { after } from "next/server";
import { route, segment } from "@/server/http";

/** Demo only: a sample supplier email with a bill attached. Reads it afterwards. */
export const POST = route(async ({ app, req, staffToken }) => {
  const inbox = await app.inbox.sample(await app.staff.at(staffToken, segment(req, -3)));
  after(() => app.assistant.runSoon());
  return inbox;
});
