"use client";

import { Dialog } from "@base-ui/react/dialog";
import { actionCopy, staffCopy } from "@peni/brand/copy";
import { Volume2, X } from "lucide-react";
import { useRef } from "react";
import { Button, cx, iconButtonClasses } from "@/components/ui";

/**
 * Shift start (design-system.md §9.10): on the first load in a tab, a modal card asks for one
 * tap — browsers only let a page make sound after a tap, and the same tap asks for the screen
 * wake lock. "Vardiyayı başlat" runs `onStart` inside the click; any other way out (Escape,
 * the backdrop, "Kapat") runs `onDismiss`, and the board shows the "Ses kapalı" banner.
 */
export function ShiftStart({ open, onStart, onDismiss }: { open: boolean; onStart: () => void; onDismiss: () => void }) {
  const start = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className={cx(
            "fixed inset-0 z-50 min-h-dvh bg-black opacity-(--scrim) [--scrim:.45] dark:[--scrim:.65]",
            "transition-opacity duration-200 ease-out-strong data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:duration-150",
          )}
        />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <Dialog.Popup
            initialFocus={start}
            className={cx(
              "relative flex w-[400px] max-w-full flex-col items-center rounded-[22px] bg-surface px-6 pt-8 pb-6 text-center text-ink shadow-floating outline-none md:px-8",
              "transition-[scale,opacity] duration-200 ease-out-strong motion-reduce:duration-150",
              "data-starting-style:opacity-0 data-ending-style:opacity-0",
              "motion-safe:data-starting-style:scale-[.96] motion-safe:data-ending-style:scale-[.96]",
            )}
          >
            <span className="absolute top-2 right-2">
              <Dialog.Close aria-label={actionCopy.close} className={iconButtonClasses({ variant: "quiet" })}>
                <X aria-hidden size={20} strokeWidth={1.75} className="size-5" />
              </Dialog.Close>
            </span>
            <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <Volume2 size={32} strokeWidth={1.5} className="size-8" />
            </span>
            <Dialog.Title className="mt-5 font-display text-h3 text-ink">{staffCopy.shiftStart.title}</Dialog.Title>
            <Dialog.Description className="mt-2 max-w-[30ch] text-body text-ink-2">{staffCopy.shiftStart.body}</Dialog.Description>
            <Button ref={start} size="lg" fullWidth className="mt-7" onClick={onStart}>
              {staffCopy.shiftStart.action}
            </Button>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
