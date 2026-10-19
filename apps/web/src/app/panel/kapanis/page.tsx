import type { Metadata } from "next";
import { Months } from "./months";

export const metadata: Metadata = { title: "Ay kapanışı · Kafe paneli", robots: { index: false } };

/** Closing finished months (plan piece 20). `?kafe=moda` picks the café. */
export default async function MonthsPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Months cafeSlug={q.kafe ?? null} />;
}
