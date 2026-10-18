import { quickEntrySchema } from "@peni/api";
import { after } from "next/server";
import { body, route, segment } from "@/server/http";

/**
 * Quick entry (piece 28): "Tesisatçıya 450 lira nakit ödedim". Read after the answer goes
 * out; each expense in it becomes a draft on Taslaklar. Needs "bills.add".
 */
export const POST = route(async ({ app, req, staffToken }) => {
  const result = await app.assistant.quick(await app.staff.at(staffToken, segment(req, -2)), await body(req, quickEntrySchema));
  after(() => app.assistant.runSoon());
  return result;
});
