import type { Metadata } from "next";
import { ClaimByCode } from "./claim";

export const metadata: Metadata = { title: "Penny kodu", robots: { index: false } };

/** Typing the customer screen's 4-digit code instead of scanning (plan piece 10). `?kafe=moda` picks the café. */
export default async function ClaimCodePage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <ClaimByCode cafeSlug={(await searchParams).kafe ?? null} />;
}
