import Link from "next/link";
import { Wordmark } from "@/components/chrome/wordmark";

/** Fallback 404 outside the customer chrome (e.g. an unknown café on the staff panel). */
export default function RootNotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[640px] flex-col items-center justify-center gap-6 px-4 text-center">
      <Wordmark />
      <h1 className="font-display text-h3">Bu sayfa masada yok.</h1>
      <Link
        href="/"
        className="inline-flex h-12 items-center rounded-[10px] border-[1.5px] border-line-strong bg-surface px-5 text-button text-ink transition-[scale,background-color] duration-150 ease-out-strong hover:bg-surface-2 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        Kafelere dön
      </Link>
    </div>
  );
}
