import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskiKit } from "./aski-kit";

export const metadata: Metadata = {
  title: "Kit · Askı",
  robots: { index: false, follow: false },
};

/**
 * /kit/aski: the café page's Askı module (design-system.md §9.3) on live demo data, with every
 * take state [G3] and panel variant one link away (`?durum=…`). Development only: a production
 * build answers 404 unless it was built with NEXT_PUBLIC_KIT=1.
 */
export default function AskiKitPage() {
  if (process.env.NODE_ENV !== "development" && process.env.NEXT_PUBLIC_KIT !== "1") notFound();
  return <AskiKit />;
}
