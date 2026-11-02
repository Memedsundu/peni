import { tillReportSchema } from "@peni/api";
import { body, route, segment } from "@/server/http";

/** An X or Z report from the till's Kasa view. Needs "cash.drawer". */
export const POST = route(async ({ app, req, staffToken }) =>
  app.yazarkasa.tillReport(await app.staff.at(staffToken, segment(req, -3)), (await body(req, tillReportSchema)).kind),
);
