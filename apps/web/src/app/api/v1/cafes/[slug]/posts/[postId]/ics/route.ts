import { NextResponse } from "next/server";
import { route, segment } from "@/server/http";

/** A Peni masası as an .ics file. Public, so a phone can open it straight in its calendar. [G22] */
export const GET = route(async ({ app, req }) => {
  const { filename, body } = await app.eventIcs(segment(req, -4), segment(req, -2));
  return new NextResponse(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
