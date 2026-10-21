import type { Metadata } from "next";
import { Counter } from "./counter";

export const metadata: Metadata = { title: "Penny · Kafe paneli", robots: { index: false } };

/** The penny screen (N11), for a café on its own till. `?kafe=moda` picks the café. */
export default async function PennyPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Counter cafeSlug={q.kafe ?? null} />;
}
