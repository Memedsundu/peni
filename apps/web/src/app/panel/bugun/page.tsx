import type { Metadata } from "next";
import { Today } from "./today";

export const metadata: Metadata = { title: "Bugün · Kafe paneli", robots: { index: false } };

/** What needs doing today and today's tasks (plan piece 22). `?kafe=moda` picks the café. */
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  return <Today cafeSlug={q.kafe ?? null} />;
}
