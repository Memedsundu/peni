import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandKit } from "./brand-kit";

export const metadata: Metadata = {
  title: "Kit · Marka nesneleri",
  robots: { index: false, follow: false },
};

/**
 * /kit/brand: every signature object at every size and state, with buttons that replay the
 * named animations (design-system.md §6, §7.2). Development only: a production build answers
 * 404 unless it was built with NEXT_PUBLIC_KIT=1.
 */
export default function BrandKitPage() {
  if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_KIT !== "1") notFound();
  return <BrandKit />;
}
