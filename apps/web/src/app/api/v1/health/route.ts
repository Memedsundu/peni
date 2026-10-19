import { NextResponse } from "next/server";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

/**
 * For an uptime monitor (plan piece 34): 200 when the app answers and its database does,
 * 503 when not. Says nothing about cafés or people.
 */
export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  try {
    const app = await getApp();
    await app.identity.listCafes();
    return NextResponse.json({ ok: true, database: "ok", ms: Date.now() - started, version }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", what: "health", error: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ ok: false, database: "down", ms: Date.now() - started, version }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
