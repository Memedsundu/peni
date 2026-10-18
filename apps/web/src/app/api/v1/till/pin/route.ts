import { pinSignInSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, STAFF_COOKIE, tillTokenFrom } from "@/server/http";

/** PIN sign-in on a computer set up as a till. The session lasts a shift. */
export const POST = route(async ({ app, req }) => {
  const { memberId, pin } = await body(req, pinSignInSchema);
  const session = await app.staff.pinSignIn(tillTokenFrom(req), memberId, pin);
  const res = NextResponse.json(session);
  res.cookies.set(STAFF_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 12 * 3600,
  });
  return res;
});
