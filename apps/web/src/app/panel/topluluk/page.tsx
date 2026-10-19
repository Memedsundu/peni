import type { Metadata } from "next";
import { Community } from "./community";

export const metadata: Metadata = { title: "Topluluk · Kafe paneli", robots: { index: false } };

/** The café's feed, from its own side (plan piece 14). `?kafe=moda` picks the café. */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <Community cafeSlug={(await searchParams).kafe ?? null} />;
}
