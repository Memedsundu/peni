import { registerDeviceSchema } from "@peni/api";
import { NextResponse } from "next/server";
import { body, route, segment, TILL_COOKIE } from "@/server/http";

export const GET = route(async ({ app, req, staffToken }) =>
  app.staff.devices(await app.staff.at(staffToken, segment(req, -2))),
);

/** Makes the calling computer a till: it keeps the device token in a cookie for a year. */
export const POST = route(async ({ app, req, staffToken }) => {
  const ctx = await app.staff.at(staffToken, segment(req, -2));
  const setup = await app.staff.registerDevice(ctx, (await body(req, registerDeviceSchema)).name);
  const res = NextResponse.json(setup);
  res.cookies.set(TILL_COOKIE, setup.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
  return res;
});
