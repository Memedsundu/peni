import { NextResponse } from "next/server";
import { route, segment } from "@/server/http";

/** The month's hours and pay as a CSV file Excel opens. Needs "pay.hours". */
export const GET = route(async ({ app, req, staffToken }) => {
  const { filename, csv } = await app.pay.exportCsv(await app.staff.at(staffToken, segment(req, -3)), new URL(req.url).searchParams.get("month") ?? "");
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
});
