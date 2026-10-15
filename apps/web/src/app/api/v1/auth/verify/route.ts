import { verifyCodeSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, SESSION_COOKIE } from "@/server/http";

export const POST = route(async ({ app, req }) => {
  const input = await body(req, verifyCodeSchema);
  const session = await app.verifyCode(input.phone, input.code, input.displayName);
  const res = NextResponse.json(session);
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
});
