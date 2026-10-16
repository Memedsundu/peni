"use client";

import { formatNumber } from "@peni/brand/format";
import { CircleAlert } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";
import { cx } from "./cx";

/** What a control inside a `Field` needs to wire itself up. */
export interface FieldControlProps {
  id: string;
  labelId: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}

const FieldContext = createContext<FieldControlProps | null>(null);

/**
 * Inside a `Field`: the id, label id, `aria-describedby` (hint + error) and `aria-invalid` for
 * its control. `Input`, `Textarea`, `PhoneInput` and `CodeInput` call this themselves; use it
 * for any other control you put in a Field.
 */
export function useFieldControl(): FieldControlProps | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** The error sentence ("Numara 5 ile başlamalı ve 10 haneli olmalı."). Shown with `CircleAlert`. */
  error?: ReactNode;
  /** "0/140" under the control, right-aligned. Pair it with the control's `maxLength`. */
  counter?: { length: number; max: number };
  /** Hide the label visually (it stays the accessible name). Use only when a visible heading already names the control. */
  labelHidden?: boolean;
  /** Override the generated control id. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Field (design-system.md §12.2): a real label above the control, then the hint, then the
 * error. Wires `id`, `aria-describedby` and `aria-invalid` into the control through context.
 * The error line is `danger` text with `CircleAlert`, inside a polite live region so it is
 * announced when it appears.
 */
export function Field({ label, hint, error, counter, labelHidden = false, id: idProp, className, children }: FieldProps) {
  const auto = useId();
  const id = idProp ?? `${auto}-control`;
  const labelId = `${auto}-label`;
  const hintId = `${auto}-hint`;
  const errorId = `${auto}-error`;
  const hasHint = hint != null && hint !== false;
  const hasError = error != null && error !== false && error !== "";

  const control: FieldControlProps = {
    id,
    labelId,
    "aria-describedby": cx(hasHint && hintId, hasError && errorId) || undefined,
    "aria-invalid": hasError ? true : undefined,
  };

  return (
    // Margins rather than `gap`: the live region below is always in the tree (an empty one must
    // add no space), and it can't be `display: contents` or `none` without losing its role.
    <div className={cx("flex flex-col", className)}>
      <label id={labelId} htmlFor={id} className={cx("mb-2 text-body font-semibold text-ink", labelHidden && "sr-only")}>
        {label}
      </label>
      <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
      {(hasHint || counter) && (
        <div className="mt-1.5 flex items-start justify-between gap-3">
          {hasHint ? (
            <p id={hintId} className="text-meta text-ink-2">
              {hint}
            </p>
          ) : (
            <span />
          )}
          {counter && (
            // The limit is enforced by maxLength; the counter is a visual aid only.
            <p aria-hidden className={cx("shrink-0 text-meta tabular-nums", counter.length >= counter.max ? "text-ink" : "text-ink-2")}>
              {formatNumber(counter.length)}/{formatNumber(counter.max)}
            </p>
          )}
        </div>
      )}
      <div aria-live="polite" className={hasError ? "mt-1.5" : undefined}>
        {hasError && (
          <p id={errorId} className="flex items-start gap-1.5 text-meta text-danger">
            <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
