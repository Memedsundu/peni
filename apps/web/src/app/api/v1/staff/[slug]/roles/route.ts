import { saveRolesSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

export const GET = route(async ({ app, req, staffToken }) =>
  app.staff.roles(await app.staff.at(staffToken, segment(req, -2))),
);

export const POST = route(async ({ app, req, staffToken }) =>
  app.staff.saveRoles(await app.staff.at(staffToken, segment(req, -2)), (await body(req, saveRolesSchema)).roles),
);
