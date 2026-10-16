import type { Metadata } from "next";

export const metadata: Metadata = { title: "Masa kuralları" };

/** Placeholder until the reading page lands (design-system.md §9.9). */
export default function MasaKurallariPage() {
  return (
    <article className="mx-auto max-w-[640px]">
      <p className="legend text-ink-2">Masa kuralları</p>
      <h1 className="mt-2 font-display text-h1">Masa kuralları</h1>
      <div aria-hidden className="rule-oxford mt-4" />
    </article>
  );
}
