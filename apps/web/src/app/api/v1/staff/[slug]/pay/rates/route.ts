import { setRateSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** An hourly rate from a day on; answers with `?month=`. Needs "pay.hours". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.pay.setRate(await app.staff.at(staffToken, segment(req, -3)), new URL(req.url).searchParams.get("month") ?? "", await body(req, setRateSchema)),
);
