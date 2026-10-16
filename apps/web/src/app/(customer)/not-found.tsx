import type { Metadata } from "next";
import { NotFoundState } from "@/components/home/not-found-state";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/** 404 inside the customer chrome: one sentence and one way back (design-system.md §12.2). */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[55dvh] max-w-[640px] flex-col items-center justify-center">
      <NotFoundState />
    </div>
  );
}
