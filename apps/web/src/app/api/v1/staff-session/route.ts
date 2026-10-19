import { staffSignInSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, STAFF_COOKIE } from "@/server/http";

/** Who is signed in to the café panel, and their cafés with what they may do at each. */
export const GET = route(async ({ app, staffToken }) => app.staff.me(staffToken));

/** Staff sign-in with email and password. */
export const POST = route(async ({ app, req }) => {
  const { email, password } = await body(req, staffSignInSchema);
  const session = await app.staff.signIn(email, password);
  const res = NextResponse.json(session);
  res.cookies.set(STAFF_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 14 * 24 * 3600,
  });
  return res;
});
