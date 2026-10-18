import { cashMoveSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Cash put in or taken out by hand, with a reason. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.cash.move(await app.staff.at(staffToken, segment(req, -3)), await body(req, cashMoveSchema)),
);
