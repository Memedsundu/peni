"use client";

import { SEP } from "@peni/brand/format";
import { statusWords } from "@peni/brand/copy";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useActiveOrder } from "./active-order";

/** The chip is hidden on the fiş itself, which already says everything. */
export function useActiveOrderChipVisible(): boolean {
  const { order } = useActiveOrder();
  const pathname = usePathname();
  return order !== null && !pathname.startsWith("/siparis/");
}

/**
 * Header chip for the newest active order (design-system.md §8.2): dot + "P-003 · Hazırlanıyor",
 * 36px tall inside a 44px hit area, linking to the fiş. Turns `success` at Hazır. The dot is
 * decorative; the words carry the state. There is no floating order pill on web (D10).
 */
export function ActiveOrderChip() {
  const { order } = useActiveOrder();
  const visible = useActiveOrderChipVisible();
  const label = order ? [order.orderNumber, statusWords[order.status]].filter(Boolean).join(SEP) : "";
  const ready = order?.status === "ready";

  // Say "P-003 · Hazır" once when the order turns ready while the customer is elsewhere.
  const [announcement, setAnnouncement] = useState("");
  const last = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = order ? { id: order.id, status: order.status } : null;
    if (order && ready && prev?.id === order.id && prev.status !== "ready") setAnnouncement(label);
  }, [order, ready, label]);

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {visible ? announcement : ""}
      </span>
      {visible && order && (
        <Link
          href={`/siparis/${order.id}`}
          prefetch={false}
          className="group inline-flex h-11 shrink-0 items-center rounded-[10px]"
        >
          <span
            className={`inline-flex h-9 items-center gap-2 rounded-[10px] border-[1.5px] px-3 text-meta font-semibold whitespace-nowrap tabular-nums transition-colors duration-300 ease-out-strong motion-reduce:transition-none ${
              ready
                ? "border-success bg-success text-on-success"
                : "border-line-strong bg-surface text-ink group-hover:bg-surface-2"
            }`}
          >
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${ready ? "bg-on-success" : "bg-masa"}`} />
            {label}
          </span>
        </Link>
      )}
    </>
  );
}
