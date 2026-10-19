import { publishWeekSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Yayınla", or back to a draft. Needs "shifts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.shifts.publish(await app.staff.at(staffToken, segment(req, -3)), await body(req, publishWeekSchema)),
);
