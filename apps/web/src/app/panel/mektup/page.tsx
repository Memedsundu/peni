import type { Metadata } from "next";
import { Letters } from "./letter";

export const metadata: Metadata = { title: "Haftalık mektup · Kafe paneli", robots: { index: false } };

/** The weekly letter (plan piece 30). `?kafe=moda&hafta=2026-10-12` picks the café and a week's Monday. */
export default async function LetterPage({ searchParams }: { searchParams: Promise<{ kafe?: string; hafta?: string }> }) {
  const q = await searchParams;
  return <Letters cafeSlug={q.kafe ?? null} week={q.hafta ?? null} />;
}
