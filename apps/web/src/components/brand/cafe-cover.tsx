import { cafeDevice } from "@peni/brand/format";
import { COVER_PATTERN, DEVICE } from "@peni/brand/shapes";
import type { CafeHue } from "@peni/brand/tokens";
import Image from "next/image";
import { useId, ViewTransition } from "react";
import { cx, svgId } from "./_cx";
import { hueVar } from "./cafe-hue-band";

export interface CafeCoverCafe {
  slug: string;
  name: string;
  coverImageUrl: string | null;
  hue?: CafeHue | null;
}

/**
 * Café cover (design-system.md §6.4). card: 16/7, top corners 14. hero: 160px tall on phones,
 * 200px from 768px, all corners 14.
 *
 * With a photo: the image, covering, `alt=""`, on a 4px colourway bottom edge. Without one, a
 * deterministic plate: the café colourway with its device tiled in cream at 16%. In dark
 * mode it carries the 1px plate ring.
 *
 * It is the shared element of the card -> café morph (A16): both covers are wrapped in
 * `<ViewTransition name="cafe-{slug}" share="morph" default="none">`.
 */
export function CafeCover({
  cafe,
  size,
  priority = false,
  morph = true,
  className,
}: {
  cafe: CafeCoverCafe;
  size: "card" | "hero";
  /** The hero cover is the LCP image on the café page. */
  priority?: boolean;
  /**
   * Take part in the card -> café morph. A view-transition name must be unique on the page, so
   * pass false for any second cover of the same café on one screen.
   */
  morph?: boolean;
  className?: string;
}) {
  const id = svgId(useId());
  const device = DEVICE[cafeDevice(cafe.slug)];
  const hue = hueVar(cafe.slug, cafe.hue);
  const P = COVER_PATTERN;

  const cover = (
    <div
      className={cx(
        "relative isolate overflow-hidden",
        size === "card" ? "aspect-[16/7] rounded-t-[14px]" : "h-40 rounded-[14px] md:h-[200px]",
        className,
      )}
      style={{ background: hue, boxShadow: "0 0 0 1px var(--plate-ring)" }}
    >
      {cafe.coverImageUrl ? (
        <>
          <Image
            src={cafe.coverImageUrl}
            alt=""
            fill
            priority={priority}
            // Covers come from each café's own upload host; add it to `images.remotePatterns`
            // and drop `unoptimized` once that host is known.
            unoptimized
            sizes={size === "card" ? "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw" : "(min-width: 1120px) 1120px, 100vw"}
            className="object-cover"
          />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: hue }} />
        </>
      ) : (
        <svg width="100%" height="100%" aria-hidden focusable="false" className="absolute inset-0 block">
          <defs>
            <pattern id={id} width={P.size} height={P.size} patternUnits="userSpaceOnUse">
              <g
                fill="none"
                stroke={P.stroke}
                strokeOpacity={P.strokeOpacity}
                strokeWidth={P.strokeWidth}
                strokeLinecap={P.strokeLinecap}
                strokeLinejoin={P.strokeLinejoin}
              >
                {P.offsets.map((o) => (
                  <path key={o.transform} d={device} transform={o.transform} />
                ))}
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={hue} />
          <rect width="100%" height="100%" fill={`url(#${id})`} />
        </svg>
      )}
    </div>
  );
  return morph ? (
    <ViewTransition name={`cafe-${cafe.slug}`} share="morph" default="none">
      {cover}
    </ViewTransition>
  ) : (
    cover
  );
}
