"use client";

import { actionCopy, orderCopy } from "@peni/brand/copy";
import { useRef } from "react";
import { Banner, Button, Sheet } from "@/components/ui";

/** The barista moved first while the sheet was open: there is nothing left to cancel. */
const TOO_LATE = "Barista siparişini hazırlamaya başladı; artık iptal edilemez.";

/**
 * Cancel confirm sheet (§9.4, D16): it opens only while the order is `submitted`, so a double
 * tap can never cancel. "Vazgeç" is the primary and holds the first focus; "İptal et" is the
 * quiet danger. Errors stay inline in the sheet. If the barista accepts while it is open, the
 * sheet says so and offers only "Tamam".
 */
export function CancelSheet({
  open,
  onOpenChange,
  busy,
  error,
  tooLate,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  /** The order is no longer `submitted`. */
  tooLate: boolean;
  onConfirm: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
      title={orderCopy.cancelSheet.title}
      description={tooLate ? undefined : orderCopy.cancelSheet.body}
      initialFocus={keep}
      footer={
        tooLate ? (
          <Button ref={keep} variant="primary" fullWidth onClick={() => onOpenChange(false)}>
            {actionCopy.ok}
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger-quiet" fullWidth loading={busy} onClick={onConfirm}>
              {orderCopy.cancelSheet.confirm}
            </Button>
            <Button ref={keep} variant="primary" fullWidth disabled={busy} onClick={() => onOpenChange(false)}>
              {orderCopy.cancelSheet.keep}
            </Button>
          </div>
        )
      }
    >
      {tooLate ? (
        <Banner tone="info" title={TOO_LATE} />
      ) : error ? (
        <Banner tone="danger" title={error} />
      ) : null}
    </Sheet>
  );
}
