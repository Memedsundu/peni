"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Footer, on "/" only (design-system.md §8.2). */
export function HomeFooter() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return (
    <footer className="mx-auto w-full max-w-[1120px] px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-meta text-ink-2">1554 Tahtakale&apos;den 1652 Londra&apos;ya: bir fincanın etrafında aynı masa.</p>
        <Link
          href="/masa-kurallari"
          className="group -ml-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-[10px] px-2 text-button text-ink sm:-mr-2 sm:ml-0 sm:self-auto"
        >
          <span className="underline-offset-4 group-hover:underline">Masa kuralları</span>
          <ArrowRight size={16} absoluteStrokeWidth strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </footer>
  );
}
