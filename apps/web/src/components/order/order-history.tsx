"use client";

import type { OrderDTO } from "@peni/api";
import { statusChips } from "@peni/brand/copy";
import { formatTime, formatTL } from "@peni/brand/format";
import { Ban, Check, CircleAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { Chip, colorMotion, cx, focusRingInset, Skeleton, tappable } from "@/components/ui";
import { ordersCopy } from "./copy";
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

type ClosedStatus = keyof typeof statusChips;

/**
 * Every chip is icon + word (§3.2). The shared table gives "İptal edildi" no icon yet; until it
 * does, it reads with `Ban`, so the chip column keeps one left edge.
 */
const FALLBACK_ICON: Partial<Record<ClosedStatus, typeof Ban>> = { cancelled: Ban };

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
  const closed = order.status in statusChips ? (order.status as ClosedStatus) : null;
  const chip = closed ? statusChips[closed] : null;
  const chipIcon = chip?.icon ? CHIP_ICON[chip.icon] : closed ? FALLBACK_ICON[closed] : undefined;
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
          {/* A void order owed nothing: its total is struck through, exactly as on its fiş. */}
          {order.dueKurus > 0 ? (
            <span className={cx("shrink-0 text-button tabular-nums", voided ? "text-ink-2 line-through decoration-[1.5px]" : "text-ink")}>
              {formatTL(order.dueKurus)}
            </span>
          ) : (
            <span className="shrink-0 text-meta text-ink-2">{ordersCopy.noPayment}</span>
          )}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {chip && (
            <Chip tone={chip.tone} icon={chipIcon}>
              {chip.label}
            </Chip>
          )}
          <time dateTime={order.submittedAt} className="text-meta text-ink-2 tabular-nums">
            {formatTime(order.submittedAt)}
          </time>
        </span>
      </Link>
      {/* A sibling of the row link, never inside it: two separate targets. */}
      {/* One line, always: a long usual order ends in "…" rather than growing into a block
          heavier than its row. 100cqw is this strip's width; 31px is the chip's padding and
          border. The full words stay in the DOM (and in `title` for a pointer). */}
      {usualText && (
        <div className="@container px-4 pb-3 md:px-5">
          <Chip kind="choice" href={reorderHref(order)} prefetch={false} title={usualText} className="max-w-full">
            <span className="block max-w-[calc(100cqw-31px)] truncate">{usualText}</span>
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
