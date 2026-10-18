import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { route } from "@/server/http";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Vercel Cron, each morning (apps/web/vercel.json): the alert emails (piece 22), and any
 * background job still waiting (piece 24; most run right after they're added). It sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set, nothing can call it.
 */
export const GET = route(async ({ app, req }) => {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(`Bearer ${secret}`))) throw new AppError("UNAUTHENTICATED", "Not allowed", 401);
  return { digests: await app.alerts.sendDigests(), jobs: await app.jobs.runDue(50) };
});
