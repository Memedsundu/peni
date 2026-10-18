import type { Metadata } from "next";
import { Tasks } from "./tasks";

export const metadata: Metadata = { title: "Görevler · Kafe paneli", robots: { index: false } };

/** Task lists (plan piece 22). `?kafe=moda` picks the café, `?gun=2026-10-15` an earlier day. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ kafe?: string; gun?: string }> }) {
  const q = await searchParams;
  return <Tasks cafeSlug={q.kafe ?? null} day={q.gun ?? null} />;
}
