import type { Metadata } from "next";
import { Drafts } from "./drafts";

export const metadata: Metadata = { title: "Taslaklar · Kafe paneli", robots: { index: false } };

/** What the assistant prepared, to check and confirm (plan piece 24). `?kafe=moda&taslak=<id>` opens one. */
export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ kafe?: string; taslak?: string }> }) {
  const q = await searchParams;
  return <Drafts cafeSlug={q.kafe ?? null} draftId={q.taslak ?? null} />;
}
