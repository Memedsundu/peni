import { NextResponse } from "next/server";
import { route, STAFF_COOKIE } from "@/server/http";

export const POST = route(async ({ app, staffToken }) => {
  await app.staff.signOut(staffToken);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STAFF_COOKIE);
  return res;
});
