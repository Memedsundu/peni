import type { Metadata } from "next";
import { Wordmark } from "@/components/chrome/wordmark";
import { NotFoundState } from "@/components/home/not-found-state";

export const metadata: Metadata = { title: "Sayfa bulunamadı" };

/**
 * 404 outside the customer chrome (an unknown café on the staff panel, a stray path): the
 * wordmark to find the way home, and the same sentence as the customer 404 on bare paper.
 */
export default function RootNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-4 py-1.5 sm:px-6 lg:px-8">
      <div className="flex h-[var(--header-h)] items-center">
        <Wordmark />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center pb-[var(--header-h)]">
        <NotFoundState />
      </div>
    </main>
  );
}
