import { cafeDevice } from "@peni/brand/format";
import { APPROX, COIN_GLYPH, DEVICE, GLYPH, HOOK, MANICULE, SIMIT_GLYPH, TABLE, type DeviceKind } from "@peni/brand/shapes";

/*
 * Brand glyphs on the 24-grid (design-system.md §6.7). Stroke glyphs: currentColor, stroke
 * 1.75, round caps and joins, `viewBox="0 0 24 24"`. Decorative: always `aria-hidden`, with a
 * real text label beside them (or an `aria-label` on the control that holds them).
 *
 * They take the same props as a lucide icon (`size`, `strokeWidth`, `absoluteStrokeWidth`,
 * `className`), so they drop into any icon slot (`<Icon icon={CoinGlyph} />`, nav items).
 * `size` sets the width/height attributes (default 24); a `size-*` class wins over it.
 */

export interface GlyphProps {
  className?: string;
  /** Rendered size (width = height). Default 24. */
  size?: number | string;
  /** Stroke width in grid units (or px with `absoluteStrokeWidth`). Default 1.75. */
  strokeWidth?: number | string;
  /** Keep the stroke at `strokeWidth` px whatever the size (lucide's rule for 16px icons, §5). */
  absoluteStrokeWidth?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
}

function gridStroke(size: number | string, strokeWidth: number | string, absolute: boolean): number {
  const sw = Number(strokeWidth);
  const px = Number(size);
  return absolute && px > 0 ? (sw * 24) / px : sw;
}

function Glyph({
  className,
  size = 24,
  strokeWidth = GLYPH.strokeWidth,
  absoluteStrokeWidth = false,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox={GLYPH.viewBox}
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      fill={GLYPH.fill}
      stroke={GLYPH.stroke}
      strokeWidth={gridStroke(size, strokeWidth, absoluteStrokeWidth)}
      strokeLinecap={GLYPH.strokeLinecap}
      strokeLinejoin={GLYPH.strokeLinejoin}
    >
      {children}
    </svg>
  );
}

/** The custom Cüzdan icon (§5): coin rim (r 9), inner ring (r 6.5, stroke 1.25) and a "p" stem. */
export function CoinGlyph(props: GlyphProps) {
  const [rim, ring] = COIN_GLYPH.circles;
  // The rim takes the glyph stroke; the inner ring stays finer, in the same 1.25 : 1.75 ratio.
  const outer = gridStroke(props.size ?? 24, props.strokeWidth ?? GLYPH.strokeWidth, props.absoluteStrokeWidth ?? false);
  return (
    <Glyph {...props}>
      <circle cx={rim.cx} cy={rim.cy} r={rim.r} />
      <circle cx={ring.cx} cy={ring.cy} r={ring.r} strokeWidth={(outer * ring.strokeWidth) / rim.strokeWidth} />
      <path d={COIN_GLYPH.d} />
    </Glyph>
  );
}

/**
 * A café's device (cezve, glass or fincan): the coin emboss, the cover pattern, the café's own
 * mark. Pass `kind`, or `slug` to use `cafeDevice(slug)` (moda -> glass, kuzguncuk -> fincan).
 */
export function DeviceGlyph({ kind, slug, ...props }: GlyphProps & { kind?: DeviceKind; slug?: string }) {
  const device = kind ?? (slug ? cafeDevice(slug) : "fincan");
  return (
    <Glyph {...props}>
      <path d={DEVICE[device]} />
    </Glyph>
  );
}

/** Askı legend icon: a rail with one hook. Also the neutral "ikram" chip on staff tickets. */
export function HookGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={HOOK} />
    </Glyph>
  );
}

/** Peni masası icon: a long table with three chairs a side. */
export function TableGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={TABLE} />
    </Glyph>
  );
}

/** Simit on the 24-grid (drawn in @peni/brand; §5 lists it, §6.7 gives no path). */
export function SimitGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={SIMIT_GLYPH} />
    </Glyph>
  );
}

/**
 * The printer's fist. At most once per screen, and only on the "Neden peni?" link (§6.7),
 * at 18px there (§9.1).
 */
export function Manicule(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={MANICULE} />
    </Glyph>
  );
}

/**
 * Inline "approximately" for the web (D23: the web font subsets have no U+2248). Sits in
 * running text at the current font size and colour, and is read as "yaklaşık" by screen
 * readers: "<Approx/>3 çay" is heard as "yaklaşık 3 çay".
 */
export function Approx({ className }: { className?: string }) {
  return (
    <>
      <svg
        viewBox={APPROX.viewBox}
        width={APPROX.width}
        height={APPROX.height}
        aria-hidden
        focusable="false"
        className={className ? `inline-block align-[-.05em] ${className}` : "inline-block align-[-.05em]"}
      >
        <path d={APPROX.d} fill="none" stroke="currentColor" strokeWidth={APPROX.strokeWidth} strokeLinecap={APPROX.strokeLinecap} />
      </svg>
      <span className="sr-only">{APPROX.srText}</span>
    </>
  );
}
