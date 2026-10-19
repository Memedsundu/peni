import { after } from "next/server";
import { route, segment } from "@/server/http";

export const maxDuration = 60;

/**
 * The weekly letter (piece 30): `?hafta=` a week's Monday, else the newest. Opening it
 * starts last week's when it isn't written yet. Needs "reports.view".
 */
export const GET = route(async ({ app, req, staffToken }) => {
  const result = await app.letters.get(await app.staff.at(staffToken, segment(req, -2)), req.nextUrl.searchParams.get("hafta"));
  if (result.state === "writing") after(() => app.jobs.runDue(3));
  return result;
});
