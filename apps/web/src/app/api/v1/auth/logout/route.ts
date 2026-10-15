import { NextResponse } from "next/server";
import { route, SESSION_COOKIE } from "@/server/http";

export const POST = route(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
