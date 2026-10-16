import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CafePage, type CafeEntryParams, type CafeInitial } from "@/components/cafe/cafe-page";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Café page `/k/[slug]` (design-system.md §9.3). The café is read on the server, so the first
 * paint is the real page and the card → café cover morph (A16) lands on the real hero. If the
 * server read fails for any reason but "not found", the client tries again and owns the
 * skeleton and the error banner. An unknown café renders `not-found.tsx`; the page streams
 * behind `loading.tsx`, so the status line has already gone out as 200 and Next marks the
 * response `noindex` instead — crawlers still never take it for a page.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const entry: CafeEntryParams = { sepet: first(sp.sepet), ekle: first(sp.ekle), katil: first(sp.katil) };
  // Dev only: `?_test=client` hands the first read to the client, to review its skeleton and error banner.
  const clientRead = process.env.NODE_ENV !== "production" && first(sp._test) === "client";
  const initial: CafeInitial = clientRead ? { kind: "client" } : await readCafe(slug);
  if (initial.kind === "not_found") notFound();
  return <CafePage key={slug} slug={slug} initial={initial} entry={entry} />;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const initial = await readCafe(slug);
  return { title: initial.kind === "ok" ? initial.cafe.name : initial.kind === "not_found" ? "Kafe bulunamadı" : "Kafe" };
}

/** Shared by the page and its metadata within one request. */
const readCafe = cache(async (slug: string): Promise<CafeInitial> => {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    return { kind: "ok", cafe: await app.cafeDetail(slug, app.customerForToken(token)) };
  } catch (error) {
    // By shape, not by class: the dev runtime keeps its app instance across hot reloads, so its
    // errors can come from an older copy of the AppError module and fail an `instanceof`.
    const e = error as { status?: unknown; code?: unknown } | null;
    if (e?.status === 404 || e?.code === "NOT_FOUND") return { kind: "not_found" };
    return { kind: "client" };
  }
});
