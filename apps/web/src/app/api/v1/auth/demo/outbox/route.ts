import { z } from "zod";
import { AppError } from "@/server/app";
import { route } from "@/server/http";
import { demoOutbox } from "@/server/runtime";

/**
 * Demo only, and only while no email service is set up: the last sign-in code
 * "sent" to an address, so the demo and the smoke test can sign in by email.
 */
export const GET = route(async ({ req }) => {
  const outbox = demoOutbox();
  if (process.env.PENI_DEMO === "0" || !outbox) throw new AppError("NOT_FOUND", "Not available", 404);
  const email = z.string().min(3).parse(req.nextUrl.searchParams.get("email"));
  return { code: outbox.lastCodeFor(email) };
});
