import type { Metadata } from "next";
import { Devices } from "./devices";

export const metadata: Metadata = { title: "Cihazlar · Kafe paneli", robots: { index: false } };

/** Till computers and their yazarkasa (N12). `?kafe=moda` picks the café. */
export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Devices cafeSlug={q.kafe ?? null} />;
}
