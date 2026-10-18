import { closeCashSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Kasayı kapat" with a count. The same `key` again changes nothing. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.cash.close(await app.staff.at(staffToken, segment(req, -3)), await body(req, closeCashSchema)),
);
