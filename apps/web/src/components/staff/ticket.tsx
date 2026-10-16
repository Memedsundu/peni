"use client";

import type { OrderDTO } from "@peni/api";
import { askiCopy, cartCopy, elapsedChip, staffCopy } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import type { CafeHue } from "@peni/brand/tokens";
import { AlarmClock, Clock, Info, StickyNote, Timer } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useId, useState } from "react";
import { Fis, FisDivider, HookGlyph } from "@/components/brand";
import { Button, Chip } from "@/components/ui";
import { canMarkNoShow, elapsedMinutes, firstName, primaryAction, ticketNotes, type BumpAction } from "./model";

const ELAPSED_ICON = { Clock, Timer, AlarmClock } as const;

/** The quiet secondary: beside the payment line (its padding hangs off the edge), or under it. */
const SECONDARY = "-ml-3 @[16rem]:-mr-2 @[16rem]:ml-0";

/** A13: the new-ticket bar is fully visible for 10s, then fades over 600ms (no fade when reduced). */
export const NEW_BAR_MS = 10_000;

export interface StaffTicketProps {
  order: OrderDTO;
  slug: string;
  hue: CafeHue | null;
  posKind: "standalone" | "shelby";
  /** The board's clock (ms), ticking every few seconds: elapsed chips and "Gelmedi" follow it. */
  now: number;
  /** When the order arrived during this shift (ms): the A13 bar shows for 10s from then. */
  arrivedAt?: number;
  onBump: (action: BumpAction) => void;
  onReject: () => void;
}

/**
 * StaffTicket (design-system.md §9.10, §6.3 `Fis variant="ticket"`): a raised card with a 4px
 * café-hue band, inside an `@container`.
 *
 * 1. "P-004" in `text-ticket` (condensed, D17), the first name in `text-item`, and the elapsed
 *    chip on the right: 0–4 min `Clock` neutral, 5–9 `Timer` warning, ≥10 `AlarmClock`
 *    "12 dk · gecikiyor" danger. A Hazır ticket counts from `readyAt` and is never late — the
 *    bar is done: `Clock` neutral, from 10 min "12 dk bekliyor" in warning.
 * 2. The lines, "2 × Çay"; an askı line carries the neutral HOOK "ikram" chip — never
 *    turquoise, never beside the customer's name (§17).
 * 3. Notes on `warning-soft` with `StickyNote`.
 * 4. "Kasada ₺55" with the quiet secondary action beside it ("Yetişemiyoruz"; "Gelmedi" only
 *    ≥10 min after `readyAt`), then the 56px ink primary, always last. On a slip narrower than
 *    16rem (the three-column board on a portrait tablet) the secondary drops under the payment
 *    line, its label aligned with "Kasada". Shelby boards show "Kasada kapanacak" on ready
 *    tickets instead of a primary (D18): a flat info line, so it never reads as a dead button.
 */
export function StaffTicket({ order, slug, hue, posKind, now, arrivedAt, onBump, onReject }: StaffTicketProps) {
  const codeId = useId();
  const nameId = useId();
  const headingId = `${codeId} ${nameId}`;
  const minutes = elapsedMinutes(order, now);
  const chip = elapsedChip(minutes, order.status === "ready" ? "ready" : "making");
  const notes = ticketNotes(order);
  const primary = primaryAction(order.status, posKind);
  const canReject = order.status === "submitted" || order.status === "accepted";
  const noShow = canMarkNoShow(order, now);
  const code = order.orderNumber ?? "";

  return (
    <article aria-labelledby={headingId}>
      <Fis variant="ticket" slug={slug} hue={hue} className="isolate">
        {arrivedAt != null && <NewBar arrivedAt={arrivedAt} />}

        {/*
          The head reflows with the slip's width (an @container):
          ≥340px  P-004  Zeynep ············ [chip]
          ≥240px  P-004 ···················· [chip]   / Zeynep
          narrower: P-004 / Zeynep / [chip]
        */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={codeId} className="font-sans text-ticket tracking-[.01em] whitespace-nowrap text-ink tabular-nums [font-stretch:75%]">
            {code}
          </h3>
          <p
            id={nameId}
            className="order-last min-w-0 basis-full truncate text-item text-ink @[21.25rem]:order-none @[21.25rem]:flex-1 @[21.25rem]:basis-auto"
          >
            {firstName(order.customerName)}
          </p>
          <Chip
            tone={chip.tone}
            icon={ELAPSED_ICON[chip.icon]}
            className="mt-2 ml-auto shrink-0 self-start tabular-nums @max-[15rem]:order-last @max-[15rem]:mt-1 @max-[15rem]:ml-0"
          >
            {chip.label}
          </Chip>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {order.lines.map((line, i) => (
            <li key={`${line.productId}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-item text-ink">
              <span>{cartCopy.line(line.quantity, line.name)}</span>
              {line.fromAskida && (
                <Chip tone="neutral" icon={HookGlyph}>
                  {askiCopy.ticketChip}
                </Chip>
              )}
            </li>
          ))}
        </ul>

        {notes.length > 0 && (
          <div className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-warning-soft p-3 text-body text-ink">
            <StickyNote aria-hidden size={20} strokeWidth={1.75} className="mt-px size-5 shrink-0 text-warning-ink" />
            <div className="flex min-w-0 flex-col gap-1">
              {notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          </div>
        )}

        <FisDivider className="mt-4 mb-2" />
        <div className="flex flex-col items-start @[16rem]:flex-row @[16rem]:items-center @[16rem]:justify-between @[16rem]:gap-x-3">
          <p className="flex min-h-11 items-center text-meta text-ink-2">
            {/* One span: as loose flex items, the text would lose the space before the amount. */}
            <span>
              {order.dueKurus > 0 ? (
                <>
                  {/* "Kasada ₺55": the amount is what the till needs, so it carries the weight. */}
                  {staffCopy.payment(order.dueKurus).replace(formatTL(order.dueKurus), "")}
                  <span className="font-semibold text-ink tabular-nums">{formatTL(order.dueKurus)}</span>
                </>
              ) : (
                staffCopy.payment(0)
              )}
            </span>
          </p>
          {canReject && (
            <Button variant="quiet" size="sm" onClick={onReject} aria-describedby={headingId} className={SECONDARY}>
              {staffCopy.reject}
            </Button>
          )}
          {noShow && (
            <Button variant="quiet" size="sm" onClick={() => onBump("no_show")} aria-describedby={headingId} className={SECONDARY}>
              {staffCopy.noShow}
            </Button>
          )}
        </div>

        {primary &&
          (primary.action ? (
            <Button size="lg" fullWidth onClick={() => onBump(primary.action)} aria-describedby={headingId} className="mt-1" data-primary="">
              {primary.label}
            </Button>
          ) : (
            <p className="flex min-h-11 items-center gap-2 text-body text-ink-2">
              <Info aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0" />
              {primary.label}
            </p>
          ))}
      </Fis>
    </article>
  );
}

/** A13 `new-ticket`: a 4px `warning` bar on the left edge. No flashing, no pulse. */
function NewBar({ arrivedAt }: { arrivedAt: number }) {
  const reduce = useReducedMotion();
  // Measured from the arrival, so a remount (switching tabs on a phone) doesn't restart it.
  const [delay] = useState(() => Math.max(0, NEW_BAR_MS - (Date.now() - arrivedAt)) / 1000);
  return (
    <m.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1 bg-warning"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay, duration: reduce ? 0 : 0.6 }}
    />
  );
}
