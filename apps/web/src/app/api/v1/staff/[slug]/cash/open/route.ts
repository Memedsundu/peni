import { openCashSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Kasayı aç" with a count. The same `key` again changes nothing. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.cash.open(await app.staff.at(staffToken, segment(req, -3)), await body(req, openCashSchema)),
);
