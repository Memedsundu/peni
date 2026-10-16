"use client";

import { actionCopy } from "@peni/brand/copy";
import Link from "next/link";
import { Manicule } from "@/components/brand";
import { useChromeSession } from "@/components/chrome/session";
import { Button, cx, focusRing } from "@/components/ui";

/**
 * Home hero (design-system.md §9.1): "Mahallenin masası.", one paragraph, and the one
 * manicule on the screen pointing at "Neden peni?". Left-aligned, max 640px, on every width.
 * Signed out, a flat `surface-2` strip under it invites to "Giriş yap".
 */
export function HomeHero() {
  const session = useChromeSession();
  return (
    <section aria-labelledby="hero-title" className="max-w-[640px] md:pt-6">
      <h1 id="hero-title" className="font-display text-h1 text-ink">
        Mahallenin masası.
      </h1>
      <p className="mt-4 max-w-[54ch] text-body-lg text-ink-2 md:mt-5">
        Siparişini önceden ver, kasada öde. Her harcamada o kafeye özel peni biriktir, askıya bir çay bırak.
      </p>
      <Link
        href="/masa-kurallari"
        className={cx(
          "group -ml-2 mt-3 inline-flex min-h-11 items-center gap-2 rounded-[10px] px-2 text-button text-ink",
          focusRing,
        )}
      >
        <Manicule size={18} className="size-[18px] translate-y-px" />
        <span className="decoration-[1.5px] underline-offset-[5px] group-hover:underline">Neden peni?</span>
      </Link>

      {!session && (
        // Padding 12 around the sentence; the quiet button keeps its 44px target by overlapping it.
        <div className="mt-5 flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 p-3 md:mt-6">
          <p className="text-body text-ink">Kafeye katıl, peni biriktir.</p>
          <Button variant="quiet" size="sm" href="/giris?returnTo=%2F" className="-my-2.5 -mr-1.5">
            {actionCopy.signIn}
          </Button>
        </div>
      )}
    </section>
  );
}
