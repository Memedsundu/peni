import { cafeHue } from "@peni/brand/format";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PressShell } from "@/components/chrome/press-header";
import { getApp } from "@/server/runtime";

type Params = { params: Promise<{ slug: string }> };

async function findCafe(slug: string) {
  const app = await getApp();
  return (await app.listCafes(null)).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const cafe = await findCafe((await params).slug);
  // Staff screens never belong in a search index.
  return { title: cafe ? `Tezgâh · ${cafe.name}` : "Tezgâh", robots: { index: false, follow: false } };
}

/**
 * Press-room shell for the café panel (design-system.md §8.3): PressHeader, then the content
 * at max-width 1280px. No customer header, bottom nav or footer here.
 */
export default async function StaffLayout({ children, params }: Params & { children: React.ReactNode }) {
  const { slug } = await params;
  const cafe = await findCafe(slug);
  if (!cafe) notFound();
  return (
    <PressShell slug={cafe.slug} cafeName={cafe.name} hue={cafe.hue ?? cafeHue(cafe.slug)}>
      {children}
    </PressShell>
  );
}
