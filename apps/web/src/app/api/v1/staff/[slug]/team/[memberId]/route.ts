import { updateStaffSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const POST = route(async ({ app, req, staffToken }) =>
  app.staff.updateMember(
    await app.staff.at(staffToken, segment(req, -3)),
    segment(req, -1),
    await body(req, updateStaffSchema),
  ),
);
