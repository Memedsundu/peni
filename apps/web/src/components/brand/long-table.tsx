"use client";

import { masaCopy } from "@peni/brand/copy";
import { longTableLayout, type LongTableSeat } from "@peni/brand/shapes";
import { cssVar } from "@peni/brand/tokens";
import { useReducedMotionConfig, type TargetAndTransition, type Transition } from "motion/react";
import * as m from "motion/react-m";
import { useState } from "react";
import { spring } from "@/lib/motion";
import { cx } from "./_cx";

/*
 * Uzun masa, the long table of a Peni masası (design-system.md §6.5). Chairs on both sides,
 * filled T0, B0, T1, B1, … from the left in arrival order. Everyone is equal at the table:
 * a taken chair shows initials only when that member's profile is visible; "me" gets an ink
 * ring. Declines are never drawn. The SVG is decorative; the seats line under it is the text:
 * "6/14 yer dolu · sen de geliyorsun" / "Masa doldu".
 *
 * A14 seat-take: when `rsvpedByMe` turns true, my chair grows from .6 on `spring.seat` and
 * its initials fade in over 150ms. Reduced motion: a 150ms fade.
 */

export interface LongTableProps {
  capacity: number;
  /** `PostDTO.attendees` [G4]. Without them, `count` plain chairs are drawn (plus "me"). */
  seats?: readonly LongTableSeat[] | null;
  /** `rsvpCount`. */
  count: number;
  rsvpedByMe?: boolean;
  /** Render the seats line under the table. Default true. */
  caption?: boolean;
  className?: string;
}

// The resting state is the same for both paths ({ scale: 1, opacity: 1 }), so the server render
// (which never knows the motion preference) hydrates without a style mismatch.
const SEAT_FROM: TargetAndTransition = { scale: 0.6, opacity: 1 };
const SEAT_TO: TargetAndTransition = { scale: 1, opacity: 1 };
const SEAT_IN: Transition = spring.seat;
const FADE_FROM: TargetAndTransition = { scale: 1, opacity: 0 };
const FADE_TO: TargetAndTransition = { scale: 1, opacity: 1 };
const FADE: Transition = { duration: 0.15 };
const STILL: Transition = { duration: 0 };

export function LongTable({ capacity, seats, count, rsvpedByMe = false, caption = true, className }: LongTableProps) {
  const reduced = useReducedMotionConfig() === true;
  const table = longTableLayout(capacity, seatsFor(seats, count, rsvpedByMe));

  // A14 plays when I take my seat while looking at the table, never on first render.
  const [seen, setSeen] = useState(rsvpedByMe);
  const [took, setTook] = useState(0);
  if (rsvpedByMe !== seen) {
    setSeen(rsvpedByMe);
    if (rsvpedByMe) setTook((n) => n + 1);
  }

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <svg
        viewBox={table.viewBox}
        width={table.width}
        height={table.height}
        aria-hidden
        focusable="false"
        className="block h-auto max-w-full overflow-visible"
      >
        <rect
          x={table.table.x}
          y={table.table.y}
          width={table.table.width}
          height={table.table.height}
          rx={table.table.rx}
          fill={cssVar(table.table.fill)}
          stroke={cssVar(table.table.stroke)}
          strokeWidth={table.table.strokeWidth}
        />
        {table.chairs.map((c) => {
          if (c.state === "more") {
            return (
              <text
                key={c.order}
                x={c.cx}
                y={c.cy + table.text.dy}
                textAnchor="middle"
                fontSize={table.text.fontSize}
                fontWeight={table.text.fontWeight}
                fill={cssVar(table.text.moreFill)}
                className="font-sans tabular-nums"
              >
                {c.label}
              </text>
            );
          }
          if (c.state === "empty") {
            return (
              <circle
                key={c.order}
                cx={c.cx}
                cy={c.cy}
                r={table.chairR}
                fill={cssVar("surface")}
                stroke={cssVar(table.emptyStroke.stroke)}
                strokeWidth={table.emptyStroke.strokeWidth}
              />
            );
          }
          const me = c.state === "me";
          const animateSeat = me && took > 0;
          const initials = c.initials && (
            <m.text
              x={c.cx}
              y={c.cy + table.text.dy}
              textAnchor="middle"
              fontSize={table.text.fontSize}
              fontWeight={table.text.fontWeight}
              fill={cssVar(table.text.fill)}
              className="font-sans"
              initial={animateSeat ? FADE_FROM : false}
              animate={FADE_TO}
              transition={animateSeat ? FADE : STILL}
            >
              {c.initials}
            </m.text>
          );
          return (
            <m.g
              key={animateSeat ? `${c.order}-me${took}` : c.order}
              initial={animateSeat ? (reduced ? FADE_FROM : SEAT_FROM) : false}
              animate={reduced ? FADE_TO : SEAT_TO}
              transition={animateSeat ? (reduced ? FADE : SEAT_IN) : STILL}
            >
              {me && (
                <circle
                  cx={c.cx}
                  cy={c.cy}
                  r={table.meRing.r}
                  fill="none"
                  stroke={cssVar(table.meRing.stroke)}
                  strokeWidth={table.meRing.strokeWidth}
                />
              )}
              <circle cx={c.cx} cy={c.cy} r={table.chairR} fill={cssVar("masa")} />
              {initials}
            </m.g>
          );
        })}
      </svg>
      {caption && <p className="text-meta text-ink tabular-nums">{masaCopy.seats(count, capacity, rsvpedByMe)}</p>}
    </div>
  );
}

/**
 * Seats to draw. With attendees [G4] they are used as given (arrival order), with my chair
 * following `rsvpedByMe` so an optimistic "Geliyorum" shows at once. Until attendees exist:
 * `count` chairs with no initials, one of them mine when `rsvpedByMe` (§6.5 fallback).
 */
function seatsFor(seats: readonly LongTableSeat[] | null | undefined, count: number, rsvpedByMe: boolean): LongTableSeat[] {
  if (seats && seats.length > 0) {
    const hasMe = seats.some((s) => s.me);
    if (rsvpedByMe && !hasMe) return [...seats, { initials: null, me: true }];
    if (!rsvpedByMe && hasMe) return seats.filter((s) => !s.me);
    return [...seats];
  }
  const n = Math.max(0, Math.floor(count));
  const out: LongTableSeat[] = Array.from({ length: n }, () => ({ initials: null }));
  if (rsvpedByMe && n > 0) out[n - 1] = { initials: null, me: true };
  return out;
}
