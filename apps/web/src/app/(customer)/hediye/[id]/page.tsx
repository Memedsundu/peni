import type { GiftPreviewDTO } from "@peni/api";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isAppError } from "@/server/app";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";
import { GiftLanding } from "./gift-landing";
import { giftShareCopy } from "./og-copy";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** Gift landing `/hediye/[id]` (design-system.md §9.7, [G11]). Public; personalised when signed in. */
export default async function GiftPage({ params }: { params: Params }) {
  const { id } = await params;
  const gift = await readGift(id);
  if (!gift) notFound();
  return <GiftLanding key={gift.id} gift={gift} />;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const gift = await readGift(id).catch(() => null);
  if (!gift) return { title: "Ismarlama" };
  const { title, line } = giftShareCopy(gift);
  const description = line ?? `${gift.cafeName} için bir ısmarlama.`;
  return {
    title: "Ismarlama",
    description,
    // Link previews must not be cached as the recipient's personal page.
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Shared by the page and its metadata within one request; null when there is no such gift. */
const readGift = cache(async (id: string): Promise<GiftPreviewDTO | null> => {
  // Outside the try: cookies() signals dynamic rendering by throwing during prerender.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const app = await getApp();
  try {
    return await app.giftPreview(id, app.customerForToken(token));
  } catch (error) {
    if (isAppError(error) && (error.status === 404 || error.code === "NOT_FOUND")) return null;
    // Domain errors (PeniError) carry the code too.
    if (error instanceof Error && (error as { code?: unknown }).code === "NOT_FOUND") return null;
    throw error;
  }
});
