import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Ismarlama" };

/** Placeholder until the gift landing lands (design-system.md §9.7, [G11]); until then it points to the wallet. */
export default function GiftPage() {
  return (
    <div className="mx-auto max-w-[440px]">
      <h1 className="legend text-ink-2">Ismarlama</h1>
      <Link
        href="/cuzdan"
        className="mt-4 inline-flex h-12 items-center gap-2 rounded-[10px] bg-primary px-5 text-button text-on-primary transition-[scale,background-color] duration-150 ease-out-strong hover:bg-primary-pressed active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        Cüzdanına git
        <ArrowRight size={20} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  );
}
