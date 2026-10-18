import { resolveReportSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** Answers a report: take the thing down (maybe pausing its writer), or keep it. Needs "posts.moderate". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.feed.resolveReport(await app.staff.at(staffToken, segment(req, -3)), await body(req, resolveReportSchema)),
);
