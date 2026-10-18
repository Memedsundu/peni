"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Touch first: every target is at least 44px, and nothing depends on hover. */
const BASE = "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer select-none";

const KINDS = {
  /** Black, the one main action on a screen. */
  primary: "bg-ink text-paper border border-ink",
  /** White with a black edge. */
  secondary: "bg-paper text-ink border border-ink",
  /** Quiet: a hairline edge. */
  quiet: "bg-paper text-ink border border-line",
  /** No edge at all. */
  bare: "bg-transparent text-muted border-0",
  danger: "bg-red text-paper border border-red",
};

export function Button({
  kind = "quiet",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: keyof typeof KINDS; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "min-h-11 px-4 text-sm rounded-full", md: "min-h-12 px-5 text-base rounded-full", lg: "min-h-16 px-6 text-lg rounded-2xl" };
  return <button type="button" className={`${BASE} ${KINDS[kind]} ${sizes[size]} ${className}`} {...props} />;
}

/** A panel over the screen, for payment and corrections. Escape or the backdrop closes it. */
export function Sheet({ title, onClose, children, labelClose, wide = false }: { title: string; onClose: () => void; children: ReactNode; labelClose: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("[autofocus], input, button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-6" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full flex-col gap-5 overflow-auto rounded-3xl bg-paper p-6 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-3xl font-normal">{title}</h2>
          <Button kind="bare" size="sm" onClick={onClose} aria-label={labelClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A big number pad, for PINs and cash. */
export function Keypad({ onKey, eraseLabel, okLabel, onOk, okDisabled }: { onKey: (k: string) => void; eraseLabel: string; okLabel?: string; onOk?: () => void; okDisabled?: boolean }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const shape = "min-h-16 rounded-2xl border text-2xl font-medium tabular cursor-pointer";
  const cell = `${shape} border-line bg-paper active:bg-tile`;
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((k) => (
        <button key={k} type="button" className={cell} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
      <button type="button" className={`${cell} text-base text-muted`} onClick={() => onKey("back")} aria-label={eraseLabel}>
        ⌫
      </button>
      <button type="button" className={cell} onClick={() => onKey("0")}>
        0
      </button>
      {onOk ? (
        <button type="button" className={`${shape} border-ink bg-ink text-lg text-paper disabled:cursor-not-allowed disabled:opacity-40`} onClick={onOk} disabled={okDisabled}>
          {okLabel}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** The photo, or a calm placeholder until the café adds one. */
export function Photo({ src, alt, label, className = "" }: { src: string | null; alt: string; label: string; className?: string }) {
  if (src) return <img src={src} alt={alt} className={`object-cover ${className}`} />;
  return (
    <span aria-hidden="true" className={`flex items-center justify-center bg-tile text-xs text-muted ${className}`}>
      {label}
    </span>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "red" }) {
  return (
    <p role={tone === "red" ? "alert" : undefined} className={`rounded-2xl px-4 py-3 text-sm ${tone === "red" ? "bg-red-soft text-red" : "bg-panel text-muted"}`}>
      {children}
    </p>
  );
}
