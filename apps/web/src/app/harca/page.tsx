import type { Metadata } from "next";
import { SpendCode } from "./spend";

export const metadata: Metadata = { title: "Ödeme kodum", robots: { index: false } };

/** The ödeme kodu to show at the till (plan piece 11). `?kafe=moda` picks the café. */
export default async function SpendPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  return <SpendCode cafeSlug={(await searchParams).kafe ?? null} />;
}
