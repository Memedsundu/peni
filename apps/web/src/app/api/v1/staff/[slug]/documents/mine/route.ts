import { after } from "next/server";
import { route, segment } from "@/server/http";

/** What the viewer sent lately and what became of it: the till and Faturalar. Needs "bills.add". Runs whatever is waiting afterwards. */
export const GET = route(async ({ app, req, staffToken }) => {
  const mine = await app.assistant.mine(await app.staff.at(staffToken, segment(req, -3)));
  after(() => app.assistant.runSoon());
  return mine;
});
