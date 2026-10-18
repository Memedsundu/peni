import { route, segment } from "@/server/http";

/** Görevler: a day's lists (`?day=`, today when left out; other days need "tasks.edit"). Needs "tasks.view". */
export const GET = route(async ({ app, req, staffToken }) =>
  app.tasks.day(await app.staff.at(staffToken, segment(req, -2)), new URL(req.url).searchParams.get("day") ?? undefined),
);
