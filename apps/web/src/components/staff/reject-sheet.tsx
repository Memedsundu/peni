"use client";

import type { OrderDTO } from "@peni/api";
import { cartCopy, errorCopy, staffCopy } from "@peni/brand/copy";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Button, Chip, ChipGroup, Sheet } from "@/components/ui";
import { firstName } from "./model";

/**
 * Reject sheet (design-system.md §9.10), replacing `window.prompt`: "Müşteriye ne diyelim?",
 * three choice chips and "Siparişi geri çevir". The customer reads the chosen sentence under
 * "Kafe şu an yetişemiyor." The sheet is the confirmation, so the request goes out at once;
 * a failure stays in the sheet with what was chosen.
 */
export function RejectSheet({
  order,
  onOpenChange,
  onReject,
}: {
  /** The ticket being turned down; null closes the sheet. */
  order: OrderDTO | null;
  onOpenChange: (open: boolean) => void;
  onReject: (order: OrderDTO, reason: string) => Promise<void>;
}) {
  // Keep the last order while the sheet animates out.
  const [shown, setShown] = useState<OrderDTO | null>(order);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (order && order.id !== shown?.id) {
    setShown(order);
    setReason(null);
    setError(null);
    setBusy(false);
  }

  const confirm = async () => {
    if (!shown || !reason || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onReject(shown, reason);
      onOpenChange(false);
    } catch (e) {
      setError(errorCopy.save(e instanceof Error && e.message ? e.message : errorCopy.generic));
    } finally {
      setBusy(false);
    }
  };

  const lines = shown ? shown.lines.map((l) => cartCopy.line(l.quantity, l.name)).join(", ") : "";

  return (
    <Sheet
      open={order != null}
      onOpenChange={onOpenChange}
      eyebrow={shown ? `${shown.orderNumber ?? ""} · ${firstName(shown.customerName)}` : undefined}
      title={staffCopy.rejectSheet.title}
      description={lines}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-meta text-danger">
              <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <Button
            size="lg"
            fullWidth
            loading={busy}
            disabled={!reason}
            disabledReason={!reason ? "Önce bir cevap seç." : undefined}
            onClick={confirm}
          >
            {staffCopy.rejectSheet.confirm}
          </Button>
        </div>
      }
    >
      <ChipGroup label={staffCopy.rejectSheet.title} className="pb-1">
        {staffCopy.rejectSheet.reasons.map((r) => (
          <Chip key={r} kind="choice" selected={reason === r} onClick={() => setReason(r)}>
            {r}
          </Chip>
        ))}
      </ChipGroup>
    </Sheet>
  );
}
