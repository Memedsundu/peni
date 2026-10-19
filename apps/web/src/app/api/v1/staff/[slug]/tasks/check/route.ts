import { checkTaskSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Done, skipped or back to not done. Today needs "tasks.view"; an earlier day "tasks.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.tasks.check(await app.staff.at(staffToken, segment(req, -3)), await body(req, checkTaskSchema)),
);
