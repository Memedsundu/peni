"use client";

import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "./cx";
import { useFieldControl } from "./field";

/*
 * Inputs (design-system.md §12.2): 48px, radius 10, 16px text (no iOS zoom), 1.5px
 * `line-strong` border. Invalid: `danger` border. Disabled: `surface-2`, no border, `ink-2`.
 * Inside a `Field`, id / aria-describedby / aria-invalid come from the Field.
 */

const frame =
  "rounded-[10px] border-[1.5px] bg-surface text-body-lg text-ink transition-[border-color] duration-150 ease-out-strong motion-reduce:transition-none";
const frameStates =
  "border-line-strong aria-invalid:border-danger disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-2";
const placeholder = "placeholder:text-ink-2 placeholder:opacity-100";
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Merge Field wiring with explicit props (explicit wins; describedby ids are joined). */
function useWiring(props: { id?: string; "aria-describedby"?: string; "aria-invalid"?: ComponentPropsWithRef<"input">["aria-invalid"] }) {
  const field = useFieldControl();
  return {
    id: props.id ?? field?.id,
    "aria-describedby": cx(field?.["aria-describedby"], props["aria-describedby"]) || undefined,
    "aria-invalid": props["aria-invalid"] ?? field?.["aria-invalid"],
  };
}

export type InputProps = Omit<ComponentPropsWithRef<"input">, "prefix"> & {
  /** A fixed affix outside the editable text ("+90"), joined to the field on a `surface-2` cell. */
  prefix?: ReactNode;
};

/** Text input. With `prefix`, the frame (border, focus ring, invalid state) moves to a wrapper. */
export function Input({ prefix, className, ...props }: InputProps) {
  const wiring = useWiring(props);
  if (prefix == null || prefix === false) {
    return <input {...props} {...wiring} className={cx("h-12 w-full px-3.5", frame, frameStates, placeholder, ring, className)} />;
  }
  const invalid = wiring["aria-invalid"] === true || wiring["aria-invalid"] === "true";
  return (
    <div
      className={cx(
        "flex h-12 w-full items-stretch overflow-hidden",
        frame,
        props.disabled
          ? "cursor-not-allowed border-transparent bg-surface-2 text-ink-2"
          : invalid
            ? "border-danger"
            : "border-line-strong",
        "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus",
        className,
      )}
    >
      <span aria-hidden className="flex shrink-0 items-center border-r-[1.5px] border-line bg-surface-2 px-3 text-ink-2 tabular-nums select-none">
        {prefix}
      </span>
      <input
        {...props}
        {...wiring}
        className={cx("h-full min-w-0 flex-1 bg-transparent px-3 outline-none disabled:cursor-not-allowed", placeholder)}
      />
    </div>
  );
}

export type TextareaProps = ComponentPropsWithRef<"textarea">;

/**
 * Multi-line input: 2 rows by default, growing with its content where the browser supports
 * `field-sizing: content` (up to 240px, then it scrolls).
 */
export function Textarea({ className, rows = 2, ...props }: TextareaProps) {
  const wiring = useWiring(props);
  return (
    <textarea
      rows={rows}
      {...props}
      {...wiring}
      className={cx(
        "block min-h-[78px] max-h-60 w-full resize-none px-3.5 py-3 field-sizing-content",
        frame,
        frameStates,
        placeholder,
        ring,
        className,
      )}
    />
  );
}

/* ========================================================================================== */
/* Phone                                                                                       */
/* ========================================================================================== */

/**
 * National digits from anything typed or pasted: "+90 532 123 45 67", "0532…" and "532…" all
 * give "5321234567". At most 10 digits.
 */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("90")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  return d.slice(0, 10);
}

/** "5321234567" → "532 123 45 67" (the §9.2 mask `5xx xxx xx xx`). Partial input formats as far as it goes. */
export function formatPhoneDigits(digits: string): string {
  const d = digits.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(" ");
}

/** A Turkish mobile number: 10 digits starting with 5. Otherwise show "Numara 5 ile başlamalı ve 10 haneli olmalı." */
export function isPhoneComplete(digits: string): boolean {
  return /^5\d{9}$/.test(digits);
}

/** "5321234567" → "+905321234567", for the API. */
export function phoneE164(digits: string): string {
  return `+90${digits}`;
}

// No maxLength: a pasted "+90 532 123 45 67" is longer than the mask and must reach phoneDigits whole.
export type PhoneInputProps = Omit<InputProps, "value" | "defaultValue" | "onChange" | "type" | "prefix" | "inputMode" | "maxLength"> & {
  /** National digits only ("5321234567"); the field shows "532 123 45 67". */
  value: string;
  onValueChange: (digits: string) => void;
};

/**
 * Turkish mobile number (§9.2): "+90" fixed outside the text, mask `5xx xxx xx xx`,
 * `inputMode="tel"`, `autoComplete="tel-national"`. Pasting a full number with +90 or a
 * leading 0 works. The caret stays where you are typing while the spaces reflow.
 */
export function PhoneInput({ value, onValueChange, ref, onKeyDown, placeholder = "5xx xxx xx xx", ...props }: PhoneInputProps) {
  const inner = useRef<HTMLInputElement | null>(null);
  const caret = useRef<number | null>(null);
  const display = formatPhoneDigits(value);

  useLayoutEffect(() => {
    const el = inner.current;
    if (caret.current == null || !el || document.activeElement !== el) return;
    el.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const setRefs = (el: HTMLInputElement | null) => {
    inner.current = el;
    assignRef(ref, el);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const at = event.target.selectionStart ?? raw.length;
    const next = phoneDigits(raw);
    // Count the digits before the caret, minus the ones phoneDigits strips from the front.
    const stripped = raw.replace(/\D/g, "").length - next.length;
    const before = Math.max(0, Math.min(next.length, raw.slice(0, at).replace(/\D/g, "").length - Math.max(0, stripped)));
    const pos = caretAfterDigits(formatPhoneDigits(next), before);
    if (next === value) {
      // Nothing changed (a letter, a stray space): React puts the old text back at the end of
      // this event and won't re-render, so restore the caret right after it has — in a
      // microtask, which runs before the next keystroke can arrive (a frame callback would not).
      const el = event.target;
      const expected = display;
      queueMicrotask(() => {
        if (document.activeElement === el && el.value === expected) el.setSelectionRange(pos, pos);
      });
      return;
    }
    caret.current = pos;
    onValueChange(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const el = event.currentTarget;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s == null || s !== e) return;
    // Backspace right after a space deletes the digit before it, instead of a space that comes back.
    if (event.key === "Backspace" && el.value[s - 1] === " ") el.setSelectionRange(s - 1, s - 1);
    if (event.key === "Delete" && el.value[s] === " ") el.setSelectionRange(s + 1, s + 1);
  };

  return (
    <Input
      {...props}
      ref={setRefs}
      type="tel"
      inputMode="tel"
      autoComplete={props.autoComplete ?? "tel-national"}
      prefix="+90"
      placeholder={placeholder}
      value={display}
      onChange={onChange}
      onKeyDown={handleKeyDown}
    />
  );
}

function caretAfterDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]!)) seen++;
    if (seen === digits) return i + 1;
  }
  return formatted.length;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}
