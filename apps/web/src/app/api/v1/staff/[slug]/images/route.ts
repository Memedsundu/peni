import { MAX_IMAGE_BYTES } from "@peni/core";
import { AppError } from "@/server/errors";
import { route, segment } from "@/server/http";

/** A photo for a post, sent as it is (not as a form). The browser shrinks it first. */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -2));
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new AppError("IMAGE_TOO_LARGE", "Photos can be at most 2 MB", 413);
  return app.feed.uploadImage(ctx, new Uint8Array(await req.arrayBuffer()));
});
