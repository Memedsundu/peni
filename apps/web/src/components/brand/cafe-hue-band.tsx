import { cafeHue } from "@peni/brand/format";
import type { CafeHue } from "@peni/brand/tokens";
import { cx } from "./_cx";

/** `var(--hue-zeytin)` etc. The café's own colourway [G9], else `cafeHue(slug)`. */
export function hueVar(slug: string, hue?: CafeHue | null): string {
  return `var(--hue-${hue ?? cafeHue(slug)})`;
}

/**
 * Café colourway band (design-system.md §6.6). It means "which café", never a text background
 * (covers and the press-header name excepted). Sizes in px:
 * 6 on top of wallet coin cards · 4 on top of staff tickets · 2 under the press header ·
 * 3 (vertical) as the left edge of café posts. In dark mode it carries the 1px plate ring.
 */
export function CafeHueBand({
  slug,
  hue,
  size = 6,
  orientation = "horizontal",
  className,
}: {
  slug: string;
  hue?: CafeHue | null;
  size?: 2 | 3 | 4 | 6;
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  const horizontal = orientation === "horizontal";
  return (
    <span
      aria-hidden
      className={cx("block shrink-0", horizontal ? "w-full" : "self-stretch", className)}
      style={{
        background: hueVar(slug, hue),
        boxShadow: "0 0 0 1px var(--plate-ring)",
        ...(horizontal ? { height: size } : { width: size }),
      }}
    />
  );
}
