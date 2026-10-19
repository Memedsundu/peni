import type { Metadata } from "next";
import { Regulars } from "./regulars";

export const metadata: Metadata = { title: "Müdavimler · Kafe paneli", robots: { index: false } };

/** Müdavimler (plan piece 32). `?kafe=moda` picks the café, `?ay=2026-09` the month. */
export default async function RegularsPage({ searchParams }: { searchParams: Promise<{ kafe?: string; ay?: string }> }) {
  const q = await searchParams;
  return <Regulars cafeSlug={q.kafe ?? null} month={q.ay ?? null} />;
}
