import type { Metadata } from "next";
import { Suppliers } from "./suppliers";

export const metadata: Metadata = { title: "Tedarikçiler · Kafe paneli", robots: { index: false } };

/** Who the café buys from (plan piece 18). `?kafe=moda` picks the café, `?tedarikci=<id>` opens one. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ kafe?: string; tedarikci?: string }> }) {
  const q = await searchParams;
  return <Suppliers cafeSlug={q.kafe ?? null} supplierId={q.tedarikci ?? null} />;
}
