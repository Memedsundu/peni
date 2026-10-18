import { appleSignInSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, setSessionCookie } from "@/server/http";

/** The ID token from Sign in with Apple, plus the name Apple gives the app only the first time. */
export const POST = route(async ({ app, req }) => {
  const { idToken, name } = await body(req, appleSignInSchema);
  const session = await app.signInWithIdToken("apple", idToken, name);
  return setSessionCookie(NextResponse.json(session), req, session.token);
});
