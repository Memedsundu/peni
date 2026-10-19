import { NextResponse } from "next/server";
import { route, SESSION_COOKIE, tokenFrom } from "@/server/http";

export const POST = route(async ({ app, req }) => {
  await app.signOut(tokenFrom(req));
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
