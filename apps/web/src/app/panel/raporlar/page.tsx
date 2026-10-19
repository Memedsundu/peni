import type { Metadata } from "next";
import { Reports } from "./reports";

export const metadata: Metadata = { title: "Raporlar · Kafe paneli", robots: { index: false } };

/** How the café is doing (plan piece 23). `?kafe=moda&from=2026-10-01&through=2026-10-18` picks the café and the days. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ kafe?: string; from?: string; through?: string }> }) {
  const q = await searchParams;
  return <Reports cafeSlug={q.kafe ?? null} from={q.from ?? null} through={q.through ?? null} />;
}
