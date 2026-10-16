import { Coffee } from "lucide-react";
import Link from "next/link";

/** 404 inside the customer chrome. One sentence, one way back (EmptyState pattern, §12.2). */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center py-12 text-center md:py-20">
      <span aria-hidden className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-2">
        <Coffee size={32} strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 font-display text-h3">Bu sayfa masada yok.</h1>
      <Link
        href="/"
        className="mt-6 inline-flex h-12 items-center rounded-[10px] border-[1.5px] border-line-strong bg-surface px-5 text-button text-ink transition-[scale,background-color] duration-150 ease-out-strong hover:bg-surface-2 active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        Kafelere dön
      </Link>
    </div>
  );
}
