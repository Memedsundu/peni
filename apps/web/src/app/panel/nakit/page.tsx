import type { Metadata } from "next";
import { Money } from "./money";

export const metadata: Metadata = { title: "Nakit ve banka · Kafe paneli", robots: { index: false } };

/** The drawer, the reserve and the bank (plan piece 20). `?kafe=moda` picks the café. */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Money cafeSlug={q.kafe ?? null} />;
}
