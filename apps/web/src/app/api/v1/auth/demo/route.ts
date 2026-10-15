import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/app";
import { body, route, SESSION_COOKIE } from "@/server/http";

/** Demo only: one-tap sign-in as a seeded neighbour. Disabled when PENI_DEMO=0. */
export const POST = route(async ({ app, req }) => {
  if (process.env.PENI_DEMO === "0") throw new AppError("NOT_FOUND", "Not available", 404);
  const { customerId } = await body(req, z.object({ customerId: z.string() }));
  if (!app.customers.has(customerId)) throw new AppError("NOT_FOUND", "Unknown demo customer", 404);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, app.createSessionFor(customerId), { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
});
