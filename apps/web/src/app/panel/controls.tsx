"use client";

import { useState, type ReactNode } from "react";
import { field } from "./shell";
import { errorText, type Lang } from "./text";

/** A row of choices, one picked: kg / L / adet, or why something went to waste. */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
              o.value === value ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A labelled text box with an optional unit after it ("kg", "₺") and a hint under it. */
export function Field({
  label,
  value,
  onChange,
  suffix,
  hint,
  inputMode,
  placeholder,
  autoFocus,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: ReactNode;
  inputMode?: "decimal" | "text";
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted">
      {label}
      <span className="relative flex items-center">
        <input
          className={`${field} min-h-12 ${suffix ? "pr-16" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
        />
        {suffix && <span className="pointer-events-none absolute right-4 text-base text-muted">{suffix}</span>}
      </span>
      {hint && <span className="text-xs leading-normal">{hint}</span>}
    </label>
  );
}

/** "Bitti" in red, "Azaldı" in ink on a tile; nothing when all is well. */
export function LevelPill({ level, label }: { level: "ok" | "low" | "out"; label: string }) {
  if (level === "ok") return null;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${level === "out" ? "bg-red-soft text-red" : "bg-tile text-ink"}`}>
      {label}
    </span>
  );
}

/** A number with its label over it, for the top of a page. */
export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "red"; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-2xl font-semibold tabular ${tone === "red" ? "text-red" : ""}`}>{value}</dd>
      {sub && <dd className="text-xs text-muted">{sub}</dd>}
    </div>
  );
}

/** Runs a save once at a time, shows its error, and hands the answer on. */
export function useSave<R>(lang: Lang, onDone: (r: R) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<R>) => {
    setBusy(true);
    setError(null);
    fn().then(
      (r) => {
        setBusy(false);
        onDone(r);
      },
      (e: unknown) => {
        setError(errorText(e, lang));
        setBusy(false);
      },
    );
  };
  return { busy, error, setError, run };
}
