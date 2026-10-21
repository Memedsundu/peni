import type { Metadata } from "next";
import { Plans } from "./plans";

export const metadata: Metadata = { title: "Plan · Kafe paneli", robots: { index: false } };

/** The café's plan and the trial (N11). `?kafe=moda` picks the café. */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  // No online payment yet: "write to us" goes to the same address as the privacy notice.
  return <Plans cafeSlug={q.kafe ?? null} contactEmail={process.env.PENI_CONTACT_EMAIL?.trim() || null} />;
}
