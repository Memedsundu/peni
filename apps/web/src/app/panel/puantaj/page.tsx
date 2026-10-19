import type { Metadata } from "next";
import { Hours } from "./hours";

export const metadata: Metadata = { title: "Puantaj ve maaş · Kafe paneli", robots: { index: false } };

/** Hours worked and pay (plan piece 21). `?kafe=moda` picks the café, `?ay=2026-09` the month. */
export default async function PayPage({ searchParams }: { searchParams: Promise<{ kafe?: string; ay?: string }> }) {
  const q = await searchParams;
  return <Hours cafeSlug={q.kafe ?? null} month={q.ay ?? null} />;
}
