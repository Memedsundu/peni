import { isPeniError } from "@peni/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, isAppError, type CustomerRecord, type PeniApp } from "./app";
import { getApp } from "./runtime";

export const SESSION_COOKIE = "peni_session";
/** Staff sessions, separate from the customer one: a barista can be both. */
export const STAFF_COOKIE = "peni_staff";
export const STAFF_HEADER = "x-peni-staff-token";
/** A computer set up as a till keeps its device token here. */
export const TILL_COOKIE = "peni_till";
export const TILL_HEADER = "x-peni-till-token";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_STAFF: 403,
  MEMBERSHIP_BLOCKED: 403,
  IDEMPOTENCY_CONFLICT: 409,
  GIFT_NOT_PENDING: 409,
  CLAIM_TAKEN: 409,
  CLAIM_EXPIRED: 410,
  CLAIM_CANCELLED: 410,
  SPEND_CODE_WRONG: 404,
  SPEND_CODE_EXPIRED: 410,
  NOTHING_TO_SPEND: 409,
};

export function errorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (isPeniError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: STATUS[error.code] ?? 400 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Unexpected error" } }, { status: 500 });
}

/** Puts a customer session in the httpOnly cookie the web app relies on. 90 days, like the session. */
export function setSessionCookie(res: NextResponse, req: NextRequest, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 90 * 24 * 3600,
  });
  return res;
}

/** Mobile sends `Authorization: Bearer`; the web app relies on the httpOnly session cookie. */
export function tokenFrom(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

/** The Expo app sends the staff token in a header; the web panel relies on the httpOnly cookie. */
export function staffTokenFrom(req: NextRequest): string | null {
  return req.headers.get(STAFF_HEADER) ?? req.cookies.get(STAFF_COOKIE)?.value ?? null;
}

export function tillTokenFrom(req: NextRequest): string | null {
  return req.headers.get(TILL_HEADER) ?? req.cookies.get(TILL_COOKIE)?.value ?? null;
}

type Handler<T> = (ctx: {
  app: PeniApp;
  req: NextRequest;
  customer: CustomerRecord | null;
  /** The staff session token, if any. Check it with `app.staff.at(staffToken, slug, permission)`. */
  staffToken: string | null;
}) => Promise<T> | T;

/** Wraps a route: resolves the app and the signed-in customer, maps errors to JSON. */
export function route<T>(handler: Handler<T>, opts: { auth?: "customer" | "optional" } = {}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const app = await getApp();
      const customer = await app.customerForToken(tokenFrom(req));
      if (opts.auth === "customer" && !customer) {
        throw new AppError("UNAUTHENTICATED", "Sign in first", 401);
      }
      const result = await handler({ app, req, customer, staffToken: staffTokenFrom(req) });
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function body<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.output<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

/** Route params in Next 16 are async; this reads them from the URL instead to keep handlers short. */
export function segment(req: NextRequest, index: number): string {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts.at(index) ?? "");
}
