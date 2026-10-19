import type { Metadata } from "next";
import { Askida } from "./askida";

export const metadata: Metadata = { title: "Askıda kahve" };

/** A café's askı (plan piece 13): what's waiting on it, its wall, and leaving peni. `?kafe=moda` picks the café. */
export default async function AskidaPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <Askida cafeSlug={(await searchParams).kafe ?? null} />;
}
