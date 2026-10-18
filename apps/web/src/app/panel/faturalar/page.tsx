import type { Metadata } from "next";
import { Bills } from "./bills";

export const metadata: Metadata = { title: "Faturalar · Kafe paneli", robots: { index: false } };

/** Every bill and receipt (plan piece 18). `?kafe=moda` picks the café, `?fatura=<id>` opens one, `?yeni=1` starts a new one. */
export default async function BillsPage({ searchParams }: { searchParams: Promise<{ kafe?: string; fatura?: string; yeni?: string }> }) {
  const q = await searchParams;
  return <Bills cafeSlug={q.kafe ?? null} billId={q.fatura ?? null} adding={q.yeni === "1"} />;
}
