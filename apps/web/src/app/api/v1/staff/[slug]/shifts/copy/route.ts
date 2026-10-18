import { copyWeekSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** "Geçen haftayı kopyala" into an empty week. Needs "shifts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.shifts.copy(await app.staff.at(staffToken, segment(req, -3)), await body(req, copyWeekSchema)),
);
