import type { Metadata } from "next";
import { SendTreat } from "./send";

export const metadata: Metadata = { title: "Ismarla", robots: { index: false } };

/** Treat a friend at a café (plan piece 12). `?kafe=moda` picks the café. */
export default async function SendTreatPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <SendTreat cafeSlug={(await searchParams).kafe ?? null} />;
}
