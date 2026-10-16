"use client";

import { formatNumber, formatTL, MINUS } from "@peni/brand/format";
import NumberFlow, { type Format } from "@number-flow/react";
import { cx } from "./cx";

export type NumberRollKind = "peni" | "tl" | "number";

export interface NumberRollProps {
  /**
   * `peni` and `number`: a whole count ("1.240"). `tl`: KURUŞ, exactly like `formatTL`
   * (12000 → "₺120", 3050 → "₺30,50"). The caller writes the unit word ("peni") beside it.
   */
  value: number;
  kind?: NumberRollKind;
  /** "+2" for positive amounts. Negative amounts always get a true minus (U+2212). */
  signed?: boolean;
  /** Announce changes (`aria-live`) — e.g. a stepper count. Off by default. */
  live?: "polite" | "assertive";
  /** Passed to NumberFlow: `1` rolls up (the coin strike starts it on landing), `0` lets it pick. */
  trend?: number;
  /** `false` swaps the number with no roll (the first paint of a balance, for instance). */
  animated?: boolean;
  onAnimationsFinish?: () => void;
  className?: string;
}

const COUNT_FORMAT: Format = { maximumFractionDigits: 0 };

function tlFormat(absKurus: number): Format {
  // Same rule as formatTL: whole lira show no decimals, anything else shows two ("₺30,50").
  const fraction = Math.round(absKurus) % 100 ? 2 : 0;
  return { style: "currency", currency: "TRY", minimumFractionDigits: fraction, maximumFractionDigits: 2 };
}

/**
 * A17 `number-roll` (design-system.md §12.2): `@number-flow/react` with `locales="tr-TR"`.
 * NumberFlow respects `prefers-reduced-motion` on its own (the number just swaps).
 *
 * The rolling digits are `aria-hidden`; a visually hidden copy carries the formatted text
 * (`formatTL` / `formatNumber`), so screen readers read "₺55" rather than an image label.
 * Always `tabular-nums`; add `lining-nums` and the display font for balances.
 */
export function NumberRoll({
  value,
  kind = "peni",
  signed = false,
  live,
  trend,
  animated,
  onAnimationsFinish,
  className,
}: NumberRollProps) {
  const v = Math.round(value) + 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? MINUS : signed && v > 0 ? "+" : "";
  const spoken = kind === "tl" ? formatTL(v) : `${signed && v > 0 ? "+" : ""}${formatNumber(v)}`;
  const nfValue = kind === "tl" ? abs / 100 : abs;
  const format = kind === "tl" ? tlFormat(abs) : COUNT_FORMAT;

  return (
    <span className={cx("relative inline-block tabular-nums whitespace-nowrap", className)}>
      <NumberFlow
        aria-hidden
        value={nfValue}
        locales="tr-TR"
        format={format}
        prefix={sign || undefined}
        trend={trend}
        animated={animated}
        onAnimationsFinish={onAnimationsFinish ? () => onAnimationsFinish() : undefined}
      />
      <span className="sr-only" aria-live={live} aria-atomic={live ? true : undefined}>
        {spoken}
      </span>
    </span>
  );
}
