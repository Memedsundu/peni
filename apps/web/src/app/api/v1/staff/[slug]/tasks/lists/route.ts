import { addTaskListSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** The lists as set up. Needs "tasks.edit". */
export const GET = route(async ({ app, req, staffToken }) => app.tasks.lists(await app.staff.at(staffToken, segment(req, -3))));

/** "Yeni liste". The same `key` makes one. Needs "tasks.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.tasks.addList(await app.staff.at(staffToken, segment(req, -3)), await body(req, addTaskListSchema)),
);
