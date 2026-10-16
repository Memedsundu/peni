"use client";

import { OTPField } from "@base-ui/react/otp-field";
import { cx } from "./cx";
import { useFieldControl } from "./field";

export interface CodeInputProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires once all boxes are filled (typing, autofill or paste) — submit from here. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  /** Marks every box invalid (the Field's `error` already does this). */
  invalid?: boolean;
  autoFocus?: boolean;
  name?: string;
  className?: string;
}

/**
 * SMS code (design-system.md §9.2): six 48×56 boxes on Base UI `OTPField`, numeric,
 * `autoComplete="one-time-code"`; pasting or autofilling fills every box. Put it in a
 * `<Field label="SMS ile gelen kod">`: the label names the group and the first box, and the
 * other boxes are "2. hane" … "6. hane".
 *
 * At 360px inside a padded card the six boxes share 296px, so they shrink to ~44px wide
 * (never under the 44px target) and stop growing at 48.
 */
export function CodeInput({
  value,
  defaultValue,
  onValueChange,
  onComplete,
  length = 6,
  disabled = false,
  invalid,
  autoFocus,
  name,
  className,
}: CodeInputProps) {
  const field = useFieldControl();
  const isInvalid = invalid ?? field?.["aria-invalid"] === true;

  return (
    <OTPField.Root
      id={field?.id}
      length={length}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange ? (v) => onValueChange(v) : undefined}
      onValueComplete={onComplete ? (v) => onComplete(v) : undefined}
      validationType="numeric"
      inputMode="numeric"
      autoComplete="one-time-code"
      disabled={disabled}
      name={name}
      role="group"
      aria-labelledby={field?.labelId}
      aria-describedby={field?.["aria-describedby"]}
      className={cx("grid w-full max-w-[318px] gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }, (_, i) => (
        <OTPField.Input
          key={i}
          autoFocus={i === 0 ? autoFocus : undefined}
          aria-label={i === 0 ? undefined : `${i + 1}. hane`}
          aria-invalid={isInvalid || undefined}
          className={cx(
            // The focused box selects its digit so typing replaces it; the ring already marks the
            // box, so the browser's blue selection wash is hidden.
            "h-14 w-full max-w-12 min-w-0 rounded-[10px] border-[1.5px] bg-surface p-0 text-center text-h3 text-ink tabular-nums caret-ink selection:bg-transparent",
            "transition-[border-color] duration-150 ease-out-strong motion-reduce:transition-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            // Invalid wins over filled: every box turns danger, typed or not.
            isInvalid ? "border-danger" : "border-line-strong data-filled:border-ink",
            "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-2",
          )}
        />
      ))}
    </OTPField.Root>
  );
}
