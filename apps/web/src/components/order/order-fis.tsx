"use client";

import type { OrderDTO } from "@peni/api";
import { cartCopy, orderCopy, staffCopy } from "@peni/brand/copy";
import { capitalizeTr, formatTL, relDay, SEP } from "@peni/brand/format";
import { Fis, FisDivider, FisRow, HazirStamp, StatusTrack } from "@/components/brand";
import { cx, Skeleton } from "@/components/ui";
import { orderPageCopy } from "./copy";
import { EarnMoment, type EarnShow } from "./earn-moment";
import { fisLines, hasEarn, isVoid, orderCode, voidNotes } from "./order-model";

/*
 * The order fiş (design-system.md §9.4, §6.3): Oxford rule and "MODA KAHVESİ · SİPARİŞ",
 * then in order: the code, the customer, the StatusTrack, the headline in a live region, the
 * printed lines with neutral deductions, the total, and "Peni kodun".
 *
 * Live regions: two regions are always in the DOM, a polite one for every headline and an
 * assertive one that only ever holds the Hazır headline, so the change of politeness never
 * depends on a screen reader noticing an attribute flip.
 */

export interface OrderFisProps {
  order: OrderDTO;
  /** The order turned ready while the customer was looking: the stamp comes down (A11). */
  stampAnimates?: boolean;
  /** How the earn moment shows for `earnedPeni` (A6): see `EarnMoment`. */
  earnShow?: EarnShow;
  /** The h1 (the code). Focus lands here when the control that had it goes away (after a cancel). */
  headingRef?: React.Ref<HTMLHeadingElement>;
  now?: Date;
}

export function OrderFis({ order, stampAnimates = false, earnShow = "static", headingRef, now }: OrderFisProps) {
  const ready = order.status === "ready";
  const code = orderCode(order);
  const day = relDay(order.submittedAt, now);
  const who = [order.customerName, day !== "bugün" ? capitalizeTr(day) : null].filter(Boolean).join(SEP);

  return (
    <Fis variant="order" tone={ready ? "ready" : "default"} legend={orderCopy.legend(order.cafeName)} as="article">
      {/* The stamp sits beside the code; on a narrow slip (360px phones) it drops beside the
          name instead, so the code never has to wrap or shrink. */}
      <div className="@container mt-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
          {code ? (
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="col-span-2 justify-self-start rounded-[4px] font-display text-code whitespace-nowrap lining-nums tabular-nums @min-[19rem]:col-span-1"
            >
              <span className="sr-only">{orderCopy.headerTitle} </span>
              {code}
            </h1>
          ) : (
            <h1 ref={headingRef} tabIndex={-1} className="sr-only">
              {orderCopy.headerTitle}
            </h1>
          )}
          <p className="col-start-1 row-start-2 text-meta text-ink-2">{who}</p>
          {ready && (
            <HazirStamp
              animate={stampAnimates}
              className="col-start-2 row-start-2 mr-1 justify-self-end @min-[19rem]:row-span-2 @min-[19rem]:row-start-1"
            />
          )}
        </div>
      </div>

      <OrderTrack order={order} className="mt-6" />

      <Headline order={order} earnShow={earnShow} />

      <OrderLines order={order} />

      {order.memberCode && !isVoid(order.status) && (
        <p className="plate mt-5 text-plate text-ink-2">{orderCopy.memberCode(order.memberCode)}</p>
      )}
    </Fis>
  );
}

/**
 * The StatusTrack, and for an order that stopped (rejected, cancelled, not collected) the same
 * track at rest: the tapped stops stay ink, while the stops it never reached and the rail under
 * them fall back to the quiet `line`, so a dead order never reads as one waiting for the barista.
 * Composed here by redefining `--line-strong` for the track alone; the brand file is untouched.
 */
export function OrderTrack({ order, className }: { order: OrderDTO; className?: string }) {
  const stopped = isVoid(order.status);
  return (
    <div data-stopped={stopped || undefined} className={cx(stopped && "[--line-strong:var(--line)]", className)}>
      <StatusTrack order={order} />
    </div>
  );
}

function Headline({ order, earnShow }: { order: OrderDTO; earnShow: EarnShow }) {
  const ready = order.status === "ready";
  const code = orderCode(order);
  const earned = hasEarn(order) ? order.earnedPeni! : null;
  const notes = voidNotes(order);

  const politeText =
    order.status === "submitted" || order.status === "accepted" ? (
      <p className="font-display text-h3">{orderCopy.headline[order.status]}</p>
    ) : order.status === "collected" ? (
      <>
        <p className="font-display text-h3">{orderCopy.headline.collected}</p>
        {earned != null && <span className="sr-only">{orderCopy.earned(earned)}</span>}
      </>
    ) : !ready ? (
      <>
        <p className="font-display text-h3">{orderCopy.headline[order.status]}</p>
        {notes.note && <p className="mt-1 text-meta text-ink-2">{notes.note}</p>}
        {notes.lines.length > 0 && <p className="mt-2 text-body">{notes.lines.join(" ")}</p>}
      </>
    ) : null;

  return (
    <div className="mt-6">
      <div aria-live="polite" aria-atomic="true">
        {politeText}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {ready && (
          <>
            <p className="font-display text-h3">{orderCopy.headline.ready}</p>
            {code && <p className="mt-1 text-body-lg">{orderCopy.readyBody(code, order.dueKurus)}</p>}
          </>
        )}
      </div>
      {earned != null && (
        <div className="mt-3">
          <EarnMoment peni={earned} cafe={{ name: order.cafeName, slug: order.cafeSlug }} show={earnShow} />
        </div>
      )}
    </div>
  );
}

function OrderLines({ order }: { order: OrderDTO }) {
  const lines = fisLines(order.lines);
  const voided = isVoid(order.status);
  const due = order.dueKurus;

  return (
    <>
      <FisDivider className="mt-6" />
      <ul className="flex flex-col gap-1.5" aria-label="Sipariş">
        {lines.map((l) => (
          <li key={l.key}>
            <FisRow label={cartCopy.line(l.quantity, l.name)} value={formatTL(l.totalKurus)} />
            {l.note && <p className="text-meta text-ink-2">{l.note}</p>}
          </li>
        ))}
        {order.peniDiscountKurus > 0 && (
          <li>
            <FisRow muted label={orderCopy.peniLine} value={formatTL(-order.peniDiscountKurus)} />
          </li>
        )}
        {order.askidaKurus > 0 && (
          <li>
            <FisRow muted label={orderCopy.askiLine} value={formatTL(-order.askidaKurus)} />
          </li>
        )}
      </ul>
      {order.customerNote && <p className="mt-2 text-meta text-ink-2">{staffCopy.note(order.customerNote)}</p>}
      <FisDivider />
      <div className={cx("flex items-baseline justify-between gap-4", voided && "text-ink-2")}>
        {due > 0 ? (
          <>
            <span className="text-button">{orderCopy.dueLabel}</span>
            <span className={cx("font-sans text-h3 tabular-nums", voided && "line-through decoration-[1.5px]")}>{formatTL(due)}</span>
          </>
        ) : (
          <span className="text-button">{orderCopy.noPayment}</span>
        )}
      </div>
    </>
  );
}

/** Loading (§9.4): a skeleton fiş with the real geometry. */
export function OrderFisSkeleton() {
  return (
    <div aria-busy="true" aria-label={orderPageCopy.loading}>
      <Fis variant="order" legend={<Skeleton className="h-4 w-48" />}>
        <div className="mt-5 flex flex-col gap-2">
          <Skeleton className="h-16 w-44" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mt-6 grid grid-cols-4 justify-items-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-col items-center gap-2">
              <Skeleton radius="full" className="size-[22px]" />
              <Skeleton className="h-3.5 w-14" />
            </span>
          ))}
        </div>
        <Skeleton className="mt-6 h-6 w-4/5" />
        <Skeleton className="mt-2 h-6 w-1/2" />
        <FisDivider className="mt-6" />
        <div className="flex flex-col gap-2.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-10" />
          </div>
        </div>
        <FisDivider />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-16" />
        </div>
      </Fis>
    </div>
  );
}
