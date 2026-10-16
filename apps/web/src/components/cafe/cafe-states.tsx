"use client";

import { errorCopy } from "@peni/brand/copy";
import { Coffee } from "lucide-react";
import { CafeCover } from "@/components/brand";
import { Banner, Button, EmptyState, Skeleton } from "@/components/ui";
import { recallCover } from "./cover-memo";

/**
 * Loading (design-system.md §9.3 "Page states"): skeletons with the real geometry for the
 * cover, the masthead lines, the segmented bar and four menu rows. When the visitor came from
 * a café card, the cover is that café's own plate (remembered on tap, so the colourway is the
 * one the café chose, G9) and the card → café morph (A16) lands on it. Otherwise it is a plain
 * static plate: never a colourway guessed from the slug.
 */
export function CafeSkeleton({ slug }: { slug: string | null }) {
  return (
    <div aria-busy="true" aria-label="Kafe yükleniyor" className="flex flex-col">
      <KnownCover slug={slug} />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
        <div className="flex flex-col">
          <Skeleton radius={0} className="h-1.5 w-full" />
          <Skeleton radius={4} className="mt-3 h-11 w-2/3 md:h-14" />
          <Skeleton radius={0} className="mt-2 h-px w-full" />
          <Skeleton className="mt-1.5 h-4 w-4/5 max-w-[420px]" />
          <Skeleton className="mt-5 h-5 w-52" />
          <Skeleton className="mt-1.5 h-4 w-72 max-w-full" />
          <Skeleton radius={10} className="mt-4 h-11 w-60" />
          {/* The segmented bar: three label bars in thirds over its hairline, as light as the real one. */}
          <div className="mt-6 flex h-12 items-center border-b border-line">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-1 justify-center">
                <Skeleton className="h-3.5 w-12" />
              </div>
            ))}
          </div>
          {/* The category legend sits on the item names' axis, as in the real menu. */}
          <Skeleton className="mt-6 ml-4 h-4 w-20 md:ml-5" />
          <div className="mt-2 divide-y divide-line overflow-hidden rounded-[14px] bg-surface shadow-raised">
            {[0.5, 0.35, 0.45, 0.3].map((w, i) => (
              <div key={i} className="flex min-h-[72px] items-center gap-3 px-4 py-3 md:px-5">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-[18px]" style={{ width: `${w * 100}%` }} />
                  <Skeleton className="h-3.5 w-3/5" />
                </div>
                <div className="flex w-[116px] justify-end">
                  <Skeleton radius="full" className="size-11" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden lg:block">
          <Skeleton radius={14} className="h-48 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Not found: "Bu kafe masada yok." + "Kafelere dön". */
export function CafeNotFound() {
  return (
    <div className="mx-auto flex min-h-[50dvh] max-w-md flex-col justify-center">
      <EmptyState icon={Coffee} text={errorCopy.cafeNotFound} action={{ label: errorCopy.cafeNotFoundAction, href: "/" }} />
    </div>
  );
}

/** A network error on the first load: the café's plate, a danger banner and "Tekrar dene". */
export function CafeLoadError({ slug, message, retrying, onRetry }: { slug: string; message: string; retrying: boolean; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <KnownCover slug={slug} />
      <Banner
        tone="danger"
        // The button says "Tekrar dene"; the sentence doesn't need to say it too.
        title={message.replace(/\s*Tekrar dene\.$/, "")}
        action={
          <Button size="sm" variant="secondary" loading={retrying} loadingLabel={errorCopy.retry} onClick={onRetry}>
            {errorCopy.retry}
          </Button>
        }
      />
    </div>
  );
}

/** The café's real plate when a card told us its colourway; otherwise a plain cover skeleton. */
function KnownCover({ slug }: { slug: string | null }) {
  const known = slug ? recallCover(slug) : null;
  if (slug && known?.hue) {
    return <CafeCover cafe={{ slug, name: "", coverImageUrl: known.coverImageUrl, hue: known.hue }} size="hero" />;
  }
  return <Skeleton radius={14} className="h-40 w-full md:h-[200px]" />;
}
