import { isPeniError } from "@peni/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, isAppError, type CustomerRecord, type PeniApp } from "./app";
import { getApp } from "./runtime";

export const SESSION_COOKIE = "peni_session";

const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  MEMBERSHIP_BLOCKED: 403,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  GIFT_NOT_PENDING: 409,
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

/** Mobile sends `Authorization: Bearer`; the web app relies on the httpOnly session cookie. */
export function tokenFrom(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

type Handler<T> = (ctx: { app: PeniApp; req: NextRequest; customer: CustomerRecord | null }) => Promise<T> | T;

/** Wraps a route: resolves the app and the signed-in customer, maps errors to JSON. */
export function route<T>(handler: Handler<T>, opts: { auth?: "customer" | "staff" | "optional" } = {}) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const app = await getApp();
      const customer = app.customerForToken(tokenFrom(req));
      if (opts.auth === "customer" && !customer) {
        throw new AppError("UNAUTHENTICATED", "Sign in first", 401);
      }
      if (opts.auth === "staff" && !app.isStaffKey(req.headers.get("x-peni-staff-key") ?? req.cookies.get("peni_staff")?.value ?? null)) {
        throw new AppError("FORBIDDEN", "Staff key required", 403);
      }
      const result = await handler({ app, req, customer });
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
