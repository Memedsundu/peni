import { giveAskidaSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Askıdan ver": the askı pays for askı items on the order. The same `payKey` again pays once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.till.giveAskida(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), await body(req, giveAskidaSchema)),
);
