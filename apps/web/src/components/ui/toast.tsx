"use client";

import { staffCopy } from "@peni/brand/copy";
import { Check, CircleAlert, Info, LoaderCircle, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { toast, Toaster as SonnerToaster } from "sonner";

/**
 * Toasts (design-system.md §12.2, A18). Only for async outcomes the screen doesn't already show:
 * "1 çay askıya asıldı.", "Bağlantı kopyalandı.", `toast.error(message)` after a failed action.
 * NEVER after sending an order (D15) — the app goes to the fiş instead.
 *
 * `toast` is sonner's: `toast(message)`, `toast.success`, `toast.error`, `toast.dismiss(id)`.
 * Default duration 4000ms; an undo toast is 5000ms (`toastUndo`).
 */
export { toast };

export const TOAST_DURATION = 4000;
export const UNDO_DURATION = 5000;

const toastIcon = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

/** z 60 sits above sheets (§5). sonner's base CSS is unlayered, so these ride inline. */
const toasterStyle = {
  zIndex: 60,
  fontFamily: "var(--font-sans)",
  "--width": "min(420px, calc(100vw - 32px))",
} as CSSProperties;

/**
 * The one Toaster, configured per §12.2: top-centre, offset 16, one visible, unstyled with
 * İlan classes, lucide icons (danger is always `CircleAlert`). Mount it once at the root.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={16}
      mobileOffset={16}
      visibleToasts={1}
      duration={TOAST_DURATION}
      containerAriaLabel="Bildirimler"
      style={toasterStyle}
      icons={{
        success: <Check {...toastIcon} className="text-success-ink" />,
        error: <CircleAlert {...toastIcon} className="text-danger" />,
        warning: <CircleAlert {...toastIcon} className="text-warning-ink" />,
        info: <Info {...toastIcon} className="text-ink-2" />,
        loading: <LoaderCircle {...toastIcon} className="text-ink-2" />,
        close: <X {...toastIcon} />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Kapat",
        classNames: {
          toast:
            "flex items-start gap-3 rounded-[14px] bg-surface p-4 shadow-floating text-ink text-body w-[min(420px,calc(100vw-32px))]",
          icon: "mt-px flex shrink-0",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-body",
          description: "text-meta text-ink-2",
          actionButton:
            "text-button underline underline-offset-[3px] -my-[11px] -mr-2 inline-flex min-h-11 shrink-0 cursor-pointer items-center px-2",
          cancelButton: "text-button -my-[11px] inline-flex min-h-11 shrink-0 cursor-pointer items-center px-2 text-ink-2",
        },
      }}
    />
  );
}

export interface UndoToastOptions {
  /** Runs if "Geri al" is pressed within 5 seconds. Nothing is committed. */
  onUndo: () => void;
  /** Runs once when the toast closes without an undo (timeout, swipe or close). Send the request here. */
  onCommit: () => void;
  description?: ReactNode;
  actionLabel?: string;
}

/**
 * A deferred-commit toast (§9.10, "P-004 · Hazır" + "Geri al"): exactly one of `onUndo` or
 * `onCommit` runs. Returns the toast id; `toast.dismiss(id)` commits early (e.g. on `pagehide`
 * the screen should flush its own pending commits with `keepalive`).
 */
export function toastUndo(message: ReactNode, { onUndo, onCommit, description, actionLabel = staffCopy.undo }: UndoToastOptions) {
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    onCommit();
  };
  return toast(message, {
    description,
    duration: UNDO_DURATION,
    action: {
      label: actionLabel,
      onClick: () => {
        if (settled) return;
        settled = true;
        onUndo();
      },
    },
    onAutoClose: commit,
    onDismiss: commit,
  });
}
