import { updateShiftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Changes a shift's day, times, people or note. Needs "shifts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.shifts.update(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1), await body(req, updateShiftSchema)),
);
