import { isSheet } from "@peni/core";
import { NextResponse } from "next/server";
import { route, segment } from "@/server/http";

/** A document the café uploaded. Only for its staff ("assistant.use" or "bills.view"), and never cached by others. A spreadsheet downloads. */
export const GET = route(async ({ app, req, staffToken }) => {
  const doc = await app.assistant.document(await app.staff.at(staffToken, segment(req, -3)), segment(req, -1));
  return new NextResponse(Buffer.from(doc.bytes), {
    headers: {
      "content-type": doc.contentType,
      "content-disposition": `${isSheet(doc.contentType) ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.name || (doc.contentType === "application/pdf" ? "belge.pdf" : "belge"))}`,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
});
