"use client";

import type { OrderDTO } from "@peni/api";
import { actionCopy, orderCopy } from "@peni/brand/copy";
import { useRef, type RefObject } from "react";
import { Banner, Button, Sheet } from "@/components/ui";
import { orderPageCopy } from "./copy";
import { cancelSheetBody } from "./order-model";

/**
 * Cancel confirm sheet (§9.4, D16): it opens only while the order is `submitted`, so a double
 * tap can never cancel. "Vazgeç" is the primary and holds the first focus; "İptal et" is the
 * quiet danger. Errors stay inline in the sheet. If the barista accepts while it is open, the
 * sheet says so and offers only "Tamam". The sentence only promises peni back when peni was used.
 */
export function CancelSheet({
  order,
  open,
  onOpenChange,
  busy,
  error,
  tooLate,
  onConfirm,
  finalFocus,
  onClosed,
}: {
  order: Pick<OrderDTO, "peniDiscountKurus">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  error: string | null;
  /** The order is no longer `submitted`. */
  tooLate: boolean;
  onConfirm: () => void;
  /** Where focus goes on close (the opener, unless it is gone). */
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  /** The close animation has finished. */
  onClosed?: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const message = tooLate ? <Banner tone="info" title={orderPageCopy.cancelTooLate} /> : error ? <Banner tone="danger" title={error} /> : null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) onClosed?.();
      }}
      title={orderCopy.cancelSheet.title}
      description={tooLate ? undefined : cancelSheetBody(order)}
      initialFocus={keep}
      finalFocus={finalFocus}
      // With no message the body is empty: keep only its top gap, so the sentence sits as far
      // above the footer rule as the buttons sit below it (no dead band).
      bodyClassName={message ? undefined : "pb-0!"}
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
      {message}
    </Sheet>
  );
}
