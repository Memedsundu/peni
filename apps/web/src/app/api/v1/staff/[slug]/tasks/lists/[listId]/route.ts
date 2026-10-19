import { saveTaskListSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The whole list: name, who it's for, items in order. Needs "tasks.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.tasks.saveList(await app.staff.at(staffToken, segment(req, -4)), segment(req, -1), await body(req, saveTaskListSchema)),
);
