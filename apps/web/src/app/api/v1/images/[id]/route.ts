import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { route, segment } from "@/server/http";

/** A café's photo. Public, like the posts it's on; a photo never changes, so browsers keep it. */
export const GET = route(async ({ app, req }) => {
  const image = await app.images.get(segment(req, -1));
  if (!image) throw new AppError("NOT_FOUND", "No such photo", 404);
  return new NextResponse(Buffer.from(image.bytes), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});
