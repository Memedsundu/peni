import type { Metadata } from "next";
import { Shifts } from "./shifts";

export const metadata: Metadata = { title: "Vardiyalar · Kafe paneli", robots: { index: false } };

/** The week's shifts (plan piece 21). `?kafe=moda` picks the café, `?hafta=2026-10-12` the week. */
export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ kafe?: string; hafta?: string }> }) {
  const q = await searchParams;
  return <Shifts cafeSlug={q.kafe ?? null} week={q.hafta ?? null} />;
}
