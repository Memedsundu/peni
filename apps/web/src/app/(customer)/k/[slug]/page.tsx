import type { Metadata } from "next";
import { cookies } from "next/headers";
import { cache } from "react";
import { CafePage, type CafeEntryParams, type CafeInitial } from "@/components/cafe/cafe-page";
import { AppError } from "@/server/app";
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
 * skeleton and the error banner.
 */
export default async function Page({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const entry: CafeEntryParams = { sepet: first(sp.sepet), ekle: first(sp.ekle), katil: first(sp.katil) };
  const initial = await readCafe(slug);
  return <CafePage key={slug} slug={slug} initial={initial} entry={entry} />;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const initial = await readCafe(slug);
  return { title: initial.kind === "ok" ? initial.cafe.name : "Kafe" };
}

/** Shared by the page and its metadata within one request. */
const readCafe = cache(async (slug: string): Promise<CafeInitial> => {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  try {
    const app = await getApp();
    return { kind: "ok", cafe: await app.cafeDetail(slug, app.customerForToken(token)) };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return { kind: "not_found" };
    return { kind: "client" };
  }
});
