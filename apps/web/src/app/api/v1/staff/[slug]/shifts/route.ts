import { addShiftSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Vardiyalar: a week (`?week=` its Monday, this week when left out). Needs "shifts.view". */
export const GET = route(async ({ app, req, staffToken }) =>
  app.shifts.week(await app.staff.at(staffToken, segment(req, -2)), new URL(req.url).searchParams.get("week") ?? undefined),
);

/** A new shift. The same `key` adds one. Needs "shifts.edit". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.shifts.add(await app.staff.at(staffToken, segment(req, -2)), await body(req, addShiftSchema)),
);
