"use client";

import type { OrderDTO } from "@peni/api";
import { statusChips } from "@peni/brand/copy";
import { formatTime, formatTL } from "@peni/brand/format";
import { Check, CircleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { Chip, colorMotion, cx, focusRingInset, Skeleton, tappable } from "@/components/ui";
import { groupByDay, isVoid, itemsSummary, orderCode, reorderHref, usualLabel, usualOrderIds } from "./order-model";

/*
 * GEÇMİŞ on Siparişlerim (§9.5): one raised card of rows, grouped by `relDay`. Each row is the
 * café name + code, the items, the total and a status chip (icon + word). The most recent
 * collected order per café carries a "Her zamanki" choice chip that refills the cart.
 *
 * A row is one link to its fiş; the "Her zamanki" chip sits under it as its own link, so
 * neither nests inside the other.
 */

const CHIP_ICON = { Check, Undo2, CircleAlert } as const;

/** The total when nothing was due at the till (§11: never "₺0"). */
const NO_PAYMENT = "Ödeme yok";

type ClosedStatus = keyof typeof statusChips;

export function OrderHistory({ orders, now }: { orders: OrderDTO[]; now?: Date }) {
  const groups = groupByDay(orders, now);
  const usual = usualOrderIds(orders);

  return (
    <div className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
      {groups.map((g, gi) => (
        <section key={g.label} aria-labelledby={`gecmis-${gi}`} className={cx(gi > 0 && "border-t border-line")}>
          <h3 id={`gecmis-${gi}`} className="px-4 pt-3.5 pb-1 text-meta font-semibold text-ink-2 md:px-5">
            {g.label}
          </h3>
          <ul className="divide-y divide-line">
            {g.orders.map((o) => (
              <HistoryRow key={o.id} order={o} usual={usual.has(o.id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HistoryRow({ order, usual }: { order: OrderDTO; usual: boolean }) {
  const code = orderCode(order);
  const chip = order.status in statusChips ? statusChips[order.status as ClosedStatus] : null;
  const voided = isVoid(order.status);
  const usualText = usual ? usualLabel(order.lines) : null;

  return (
    <li>
      <Link
        href={`/siparis/${order.id}`}
        prefetch={false}
        className={cx(
          "group block px-4 py-3 md:px-5",
          tappable,
          colorMotion,
          // Inset ring: the card clips its corners.
          focusRingInset,
          "hover:bg-surface-2/50 active:bg-surface-2",
          usualText && "pb-2",
        )}
      >
        <span className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-button text-ink decoration-[1.5px] underline-offset-4 group-hover:underline">
              {order.cafeName}
              {code && <span className="font-normal text-ink-2 tabular-nums">{` · ${code}`}</span>}
            </span>
            <span className="mt-0.5 block text-meta text-ink-2">{itemsSummary(order.lines)}</span>
          </span>
          <span className={cx("shrink-0 text-button tabular-nums", voided ? "text-ink-2" : "text-ink")}>
            {order.dueKurus > 0 ? formatTL(order.dueKurus) : <span className="text-meta font-normal text-ink-2">{NO_PAYMENT}</span>}
          </span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {chip && (
            <Chip tone={chip.tone} icon={chip.icon ? CHIP_ICON[chip.icon] : undefined}>
              {chip.label}
            </Chip>
          )}
          <time dateTime={order.submittedAt} className="text-meta text-ink-2 tabular-nums">
            {formatTime(order.submittedAt)}
          </time>
        </span>
      </Link>
      {/* A sibling of the row link, never inside it: two separate targets. */}
      {usualText && (
        <div className="px-4 pb-3 md:px-5">
          <Chip kind="choice" href={reorderHref(order)} prefetch={false} className="max-w-full">
            {usualText}
          </Chip>
        </div>
      )}
    </li>
  );
}

/** Loading (§9.5): two skeleton rows with the real geometry. */
export function OrderHistorySkeleton() {
  return (
    <div aria-hidden className="overflow-hidden rounded-[14px] bg-surface shadow-raised">
      <div className="px-4 pt-3.5 pb-1 md:px-5">
        <Skeleton className="h-3.5 w-12" />
      </div>
      <div className="divide-y divide-line">
        {[0.55, 0.4].map((w, i) => (
          <div key={i} className="px-4 py-3 md:px-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4" style={{ width: `${w * 100}%` }} />
                <Skeleton className="h-3.5 w-28" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="mt-2.5 h-6 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
