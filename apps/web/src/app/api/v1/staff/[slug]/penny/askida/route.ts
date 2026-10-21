import { pennyAskidaSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Askıdan ver" without an order: one askı item for whoever asks. The same `key` again gives it once. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.counter.giveAskida(await app.staff.at(staffToken, segment(req, -3)), await body(req, pennyAskidaSchema)),
);
