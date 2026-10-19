import { addStaffSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const GET = route(async ({ app, req, staffToken }) =>
  app.staff.team(await app.staff.at(staffToken, segment(req, -2))),
);

export const POST = route(async ({ app, req, staffToken }) =>
  app.staff.addMember(await app.staff.at(staffToken, segment(req, -2)), await body(req, addStaffSchema)),
);
