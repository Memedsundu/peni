import { emailVerifySchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, setSessionCookie } from "@/server/http";

export const POST = route(async ({ app, req }) => {
  const { email, code } = await body(req, emailVerifySchema);
  const session = await app.signInWithEmailCode(email, code);
  return setSessionCookie(NextResponse.json(session), req, session.token);
});
