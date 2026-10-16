/**
 * Shared class fragments for the İlan web primitives (design-system.md §5, §7, §9).
 *
 * There is no tailwind-merge in this app: a `className` passed to a primitive is APPENDED.
 * Use it for layout (margin, width, grid placement), never to restyle colour or size —
 * pick a variant instead, or add one here.
 */

export type ClassValue = string | false | null | undefined | 0;

/** Joins truthy class names with a space. */
export function cx(...parts: ClassValue[]): string {
  let out = "";
  for (const p of parts) if (p) out = out ? `${out} ${p}` : p;
  return out;
}

/**
 * Focus ring (§9): a 2px outline in `var(--focus)` with a 2px offset. `--focus` is redefined by
 * coloured containers (D2), so the ring follows the press header and the Hazır fiş by itself.
 * globals.css sets the same rule on `:focus-visible`; the utilities make it survive an
 * `outline-none` from a parent library.
 */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Inset variant, for rows and cells inside an `overflow-hidden` card, where an outset ring would be clipped. */
export const focusRingInset = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/**
 * A1 `press`: `active:scale-[.97]` over 150ms ease-out-strong. Under reduced motion there is no
 * scale; each variant steps its background instead (its own `active:bg-*`), with no transition.
 * Disabled controls never scale.
 */
export const pressMotion =
  // Tailwind v4 `scale-*` writes the `scale` property, not `transform`, so `scale` is what transitions.
  "transition-[scale,background-color,border-color,color] duration-150 ease-out-strong motion-reduce:transition-none motion-safe:active:scale-[.97]";

/** Colour-only transitions for controls that must not scale (rows, chips in a wrapping group). */
export const colorMotion =
  "transition-[background-color,border-color,color] duration-150 ease-out-strong motion-reduce:transition-none";

/** Every tappable primitive: no grey iOS tap flash, no double-tap zoom delay, no text selection on rapid taps. */
export const tappable = "cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

/**
 * Disabled is never opacity (§3.2): `ink-2` on `surface-2`, no border, plus a visible reason
 * rendered by the component that owns the control.
 */
export const disabledLook = "cursor-not-allowed border-transparent bg-surface-2 text-ink-2";
