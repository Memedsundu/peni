"use client";

import { cartCopy } from "@peni/brand/copy";
import { Minus, Plus } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useId, useRef, type ReactNode, type Ref } from "react";
import { spring, tween } from "@/lib/motion";
import { colorMotion, cx, disabledLook, focusRing, tappable } from "./cx";
import { NumberRoll } from "./number-roll";

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Names the buttons: "Latte ekle" / "Latte azalt", and the group. */
  itemName: string;
  /**
   * At `value === min`, show only the "+" (the menu row's 0 state) and let "−" and the count
   * fade in on the first add (A3). Defaults to `min === 0`. With `false` the full stepper is
   * always drawn and "−" sits disabled on `surface-2` at the minimum.
   */
  collapsible?: boolean;
  disabled?: boolean;
  /** Shown under the stepper while "+" is disabled at `max` ("Bakiyen 141"). */
  maxReason?: ReactNode;
  className?: string;
}

/**
 * Stepper (design-system.md §12.2): − 44 · count 28 · + 44 = the fixed 116px menu slot.
 *
 * - A2 `stepper-tap`: buttons `whileTap={{ scale: .94 }}` on `spring.tap`; the count rolls with
 *   NumberFlow. Reduced motion: no scale (the fill steps to `surface-2`), the number swaps.
 * - A3 `plus-expand`: from 0 → 1, "−" and the count fade and slide in (x 8 → 0, `tween.ui`)
 *   inside the slot, so nothing shifts. Instant under reduced motion.
 * - The count is `aria-live="polite"`. When "−" collapses the stepper, focus moves to "+".
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
  step = 1,
  itemName,
  collapsible = min === 0,
  disabled = false,
  maxReason,
  className,
}: StepperProps) {
  const reduce = useReducedMotion();
  const plusRef = useRef<HTMLButtonElement>(null);
  const reasonId = useId();
  const collapsed = collapsible && value <= min;
  const atMin = value <= min;
  const atMax = value >= max;
  const showReason = atMax && !disabled && maxReason != null && maxReason !== false;

  const decrement = () => {
    const next = Math.max(min, value - step);
    // "−" is about to leave the DOM: hand focus to "+" first, so it's never dropped on <body>.
    if (collapsible && next <= min) plusRef.current?.focus();
    onChange(next);
  };
  const increment = () => onChange(Math.min(max, value + step));

  // 2 digits fit the 28px count; longer counts (a peni amount) widen it instead of clipping.
  const digits = String(Math.max(Math.abs(max), Math.abs(min))).length;
  const countWidth = `max(28px, calc(${digits}ch + 8px))`;

  const stepper = (
    <div role="group" aria-label={itemName} className={cx("relative inline-flex min-w-[116px] items-center justify-end", !showReason && className)}>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <m.div
            key="minus-and-count"
            className="flex items-center"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={reduce ? { duration: 0 } : tween.ui}
          >
            <StepButton
              label={cartCopy.remove(itemName)}
              onClick={decrement}
              disabled={disabled || atMin}
              icon={<Minus aria-hidden size={20} strokeWidth={1.75} className="size-5" />}
            />
            {/* The live region below speaks the count; this copy is for the eye. */}
            <span aria-hidden className="text-center text-item tabular-nums" style={{ minWidth: countWidth }}>
              <NumberRoll value={value} kind="number" />
            </span>
          </m.div>
        )}
      </AnimatePresence>
      <StepButton
        ref={plusRef}
        label={cartCopy.add(itemName)}
        onClick={increment}
        disabled={disabled || atMax}
        describedBy={showReason ? reasonId : undefined}
        icon={<Plus aria-hidden size={20} strokeWidth={1.75} className="size-5" />}
      />
      {/* One live region that outlives the collapse, so "0" is announced too. */}
      <span className="sr-only" aria-live="polite" aria-atomic>
        {value}
      </span>
    </div>
  );

  if (!showReason) return stepper;
  return (
    <div className={cx("inline-flex flex-col items-end gap-1", className)}>
      {stepper}
      <span id={reasonId} className="text-meta text-ink-2">
        {maxReason}
      </span>
    </div>
  );
}

function StepButton({
  ref,
  label,
  icon,
  onClick,
  disabled,
  describedBy,
}: {
  ref?: Ref<HTMLButtonElement>;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  describedBy?: string;
}) {
  return (
    <m.button
      ref={ref}
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={spring.tap}
      className={cx(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full",
        tappable,
        focusRing,
        colorMotion,
        disabled ? disabledLook : "border-[1.5px] border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2",
      )}
    >
      {icon}
    </m.button>
  );
}
