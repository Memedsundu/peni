import { NextResponse } from "next/server";
import { route, segment } from "@/server/http";

export const maxDuration = 120;

/**
 * The month's package for the mali müşavir (piece 30): a ZIP of the bills' documents,
 * statements, Z reports and an Excel workbook. Streamed, so a month of photos never waits
 * in memory. Needs "cash.manage" and "bills.view".
 */
// The folder is [closeId] only because Next wants one name per dynamic segment; here it holds the month.
export const GET = route(async ({ app, req, staffToken }) => {
  const { filename, stream } = await app.monthPackage.build(await app.staff.at(staffToken, segment(req, -5)), segment(req, -2));
  return new NextResponse(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
