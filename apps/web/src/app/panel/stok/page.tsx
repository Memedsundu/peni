import type { Metadata } from "next";
import { Stock } from "./stock";

export const metadata: Metadata = { title: "Stok · Kafe paneli", robots: { index: false } };

/** What the café has, counts and waste (plan piece 17). `?kafe=moda` picks the café. */
export default async function StockPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <Stock cafeSlug={(await searchParams).kafe ?? null} />;
}
