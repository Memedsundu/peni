"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { useId, type ReactNode } from "react";
import { cx, focusRing, tappable } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The row's words ("Adım askıda görünsün", "55 penini kullan"). */
  label: ReactNode;
  hint?: ReactNode;
  /** Right-side text before the switch ("−₺55"), `tabular-nums`. */
  value?: ReactNode;
  /**
   * `ink` (default) fills the track with ink when on. `peni` is the peni toggle ONLY: a copper
   * track and a `peni-ink` value. Nothing else in the product is copper (§3.2).
   */
  tone?: "ink" | "peni";
  disabled?: boolean;
  /** Shown in place of the hint while disabled. A disabled switch always says why. */
  disabledReason?: ReactNode;
  name?: string;
  className?: string;
}

/**
 * Switch row (design-system.md §12.2): Base UI `Switch.Root`/`Thumb`, a 52×32 track in a 56px
 * row. The whole row is the label, so the target is the row, not the 32px track.
 *
 * Track off: `surface-2` with a 1.5px `line-strong` border; on: ink (or `peni`). The thumb is
 * `surface`; while off it carries a `line-strong` ring so its position (the state) reads at
 * ≥3:1 against the track, not only the track border.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  value,
  tone = "ink",
  disabled = false,
  disabledReason,
  name,
  className,
}: SwitchProps) {
  const labelId = useId();
  const hintId = useId();
  const below = disabled && disabledReason != null && disabledReason !== false ? disabledReason : hint;
  const hasBelow = below != null && below !== false;

  return (
    <label
      className={cx(
        "flex min-h-14 items-center gap-4 py-2",
        disabled ? "cursor-not-allowed" : tappable,
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className={cx("text-body", disabled ? "text-ink-2" : "text-ink")}>
          {label}
        </span>
        {hasBelow && (
          <span id={hintId} className="text-meta text-ink-2">
            {below}
          </span>
        )}
      </span>
      {value != null && value !== false && (
        <span
          className={cx(
            "shrink-0 text-body font-semibold tabular-nums",
            disabled ? "text-ink-2" : tone === "peni" ? "text-peni-ink" : "text-ink",
          )}
        >
          {value}
        </span>
      )}
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        name={name}
        aria-labelledby={labelId}
        aria-describedby={hasBelow ? hintId : undefined}
        className={cx(
          "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border-[1.5px] p-[2.5px]",
          "transition-[background-color,border-color] duration-150 ease-out-strong motion-reduce:transition-none",
          focusRing,
          disabled
            ? "border-transparent bg-surface-2"
            : cx(
                "border-line-strong bg-surface-2 data-checked:border-transparent",
                tone === "peni" ? "data-checked:bg-peni" : "data-checked:bg-primary",
              ),
        )}
      >
        <BaseSwitch.Thumb
          className={cx(
            "block size-6 rounded-full border-[1.5px]",
            "transition-[translate,border-color,background-color] duration-150 ease-out-strong motion-reduce:transition-none",
            "data-checked:translate-x-5",
            disabled ? "border-transparent bg-line-strong" : "border-line-strong bg-surface data-checked:border-transparent",
          )}
        />
      </BaseSwitch.Root>
    </label>
  );
}
