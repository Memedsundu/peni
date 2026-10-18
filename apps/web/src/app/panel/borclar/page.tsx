import type { Metadata } from "next";
import { Debts } from "./debts";

export const metadata: Metadata = { title: "Borçlar · Kafe paneli", robots: { index: false } };

/** Everything the café owes (plan piece 19). `?kafe=moda` picks the café. */
export default async function DebtsPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Debts cafeSlug={q.kafe ?? null} />;
}
