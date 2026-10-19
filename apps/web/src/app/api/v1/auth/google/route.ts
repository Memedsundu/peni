import { googleSignInSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, setSessionCookie } from "@/server/http";

/** The ID token from Google's sign-in, on the web or in the app. */
export const POST = route(async ({ app, req }) => {
  const { idToken } = await body(req, googleSignInSchema);
  const session = await app.signInWithIdToken("google", idToken);
  return setSessionCookie(NextResponse.json(session), req, session.token);
});
