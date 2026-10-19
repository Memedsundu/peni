import { setHoursSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Hours worked per person and day; answers with `?month=`. Needs "pay.hours". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.pay.setHours(await app.staff.at(staffToken, segment(req, -3)), new URL(req.url).searchParams.get("month") ?? "", await body(req, setHoursSchema)),
);
