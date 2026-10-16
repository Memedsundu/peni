import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Kit } from "./kit";

export const metadata: Metadata = {
  title: "Bileşen kiti",
  robots: { index: false, follow: false },
};

/**
 * /kit — every web primitive (design-system.md §12.2) in every variant and state, for visual QA
 * at 360–1280px in light and dark. Only in development, or in a build with NEXT_PUBLIC_KIT=1.
 */
export default function KitPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_KIT !== "1") notFound();
  return <Kit />;
}
