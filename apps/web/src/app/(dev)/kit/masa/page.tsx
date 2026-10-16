import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MasaKit } from "@/components/cafe/masa-kit";

export const metadata: Metadata = {
  title: "Kit · Masa",
  robots: { index: false, follow: false },
};

/**
 * /kit/masa: the café page's Masa feed (design-system.md §9.3) on live demo data, with every
 * card state one link away (`?durum=…`). Development only: a production build answers 404
 * unless it was built with NEXT_PUBLIC_KIT=1.
 */
export default function MasaKitPage() {
  if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_KIT !== "1") notFound();
  return <MasaKit />;
}
