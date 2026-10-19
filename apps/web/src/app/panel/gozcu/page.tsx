import type { Metadata } from "next";
import { Watch } from "./watch";

export const metadata: Metadata = { title: "Gözcü · Kafe paneli", robots: { index: false } };

/** Gözcü (plan piece 31). `?kafe=moda` picks the café. */
export default async function WatchPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Watch cafeSlug={q.kafe ?? null} />;
}
