import { terminalTaskSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Deneme fişi", "X raporu" or "Z raporu" on this computer's yazarkasa. */
export const POST = route(async ({ app, req, staffToken }) =>
  app.yazarkasa.task(await app.staff.at(staffToken, segment(req, -4)), segment(req, -2), (await body(req, terminalTaskSchema)).kind),
);
