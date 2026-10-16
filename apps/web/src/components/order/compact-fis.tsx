"use client";

import type { OrderDTO } from "@peni/api";
import { orderCopy } from "@peni/brand/copy";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Fis, HazirStamp, StatusTrack } from "@/components/brand";
import { cx, focusRing } from "@/components/ui";
import { orderCode } from "./order-model";

/**
 * ŞİMDİ on Siparişlerim (§9.5): an active order as a compact fiş — the code in `text-h2`
 * Brygada, the StatusTrack and the headline. The whole fiş is one link to the order.
 * When the order is ready the slip is the Hazır fiş, stamp and all (A11, no stamp-down here:
 * the stamp only animates on the order's own page).
 */
export function CompactFis({ order }: { order: OrderDTO }) {
  const ready = order.status === "ready";
  const code = orderCode(order);
  const headline =
    order.status === "submitted" ? orderCopy.headline.submitted : order.status === "accepted" ? orderCopy.headline.accepted : orderCopy.headline.ready;

  const readyBody = ready && code ? orderCopy.readyBody(code, order.dueKurus) : null;
  // One short name for the whole slip, instead of every stop of the track read out.
  const label = [`${order.cafeName}, ${code ?? orderCopy.headerTitle}`, headline, readyBody].filter(Boolean).join(" ");

  return (
    <Link
      href={`/siparis/${order.id}`}
      prefetch={false}
      aria-label={label}
      className={cx("group block rounded-[14px] [-webkit-tap-highlight-color:transparent]", focusRing)}
    >
      <Fis variant="order" tone={ready ? "ready" : "default"} legend={orderCopy.legend(order.cafeName)}>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-display text-h2 whitespace-nowrap lining-nums tabular-nums">{code ?? orderCopy.headerTitle}</span>
          {ready && <HazirStamp animate={false} className="mr-1" />}
        </div>
        <StatusTrack order={order} className="mt-4" />
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-item">{headline}</p>
            {readyBody && <p className="mt-0.5 text-body">{readyBody}</p>}
          </div>
          <ArrowRight
            aria-hidden
            size={20}
            strokeWidth={1.75}
            className="mb-0.5 size-5 shrink-0 text-ink-2 transition-transform duration-150 ease-out-strong group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </div>
      </Fis>
    </Link>
  );
}
