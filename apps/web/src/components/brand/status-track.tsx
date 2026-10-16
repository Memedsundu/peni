"use client";

import { statusTrackStops, type OrderStatus } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { Check } from "lucide-react";
import { LayoutGroup, useReducedMotionConfig, type Transition } from "motion/react";
import * as m from "motion/react-m";
import { useId } from "react";
import { tween } from "@/lib/motion";
import { cx } from "./_cx";

/*
 * StatusTrack (design-system.md §6.3, A10 stage-advance). Four stops, evenly spaced:
 * İletildi · Hazırlanıyor · Hazır · Teslim. A stop moves only when a barista taps it
 * (principle 3), so a stop shows the time it was tapped, or no time at all.
 *
 * - Track 2px `line-strong`; done segments 3px `ink`, drawn left to right (`scaleX 0->1`).
 * - Done: 14px `ink` disc with a 10px Check in `on-primary`.
 * - Current: 22px ring (2px `ink`) with an 8px `ink` centre; it travels with `layoutId="stage"`.
 * - Future: 12px ring, 1.5px `line-strong`.
 * Inside a Hazır fiş every one of these reads its on-success value (the fiş redefines the tokens).
 */

export interface StatusTrackOrder {
  status: OrderStatus;
  submittedAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  closedAt: string | null;
}

type StopState = "done" | "current" | "future";

/**
 * Where each stop stands. Active orders have one current stop. A collected order is done all
 * the way. A rejected, cancelled or not-collected order stops where it was: the tapped stops
 * are done and nothing is current.
 */
function stopStates(o: StatusTrackOrder): StopState[] {
  switch (o.status) {
    case "submitted":
      return ["current", "future", "future", "future"];
    case "accepted":
      return ["done", "current", "future", "future"];
    case "ready":
      return ["done", "done", "current", "future"];
    case "collected":
      return ["done", "done", "done", "done"];
    default:
      return ["done", o.acceptedAt ? "done" : "future", o.readyAt ? "done" : "future", "future"];
  }
}

export function StatusTrack({ order, className }: { order: StatusTrackOrder; className?: string }) {
  const group = useId();
  const reduced = useReducedMotionConfig() === true;
  const states = stopStates(order);
  const times = [order.submittedAt, order.acceptedAt, order.readyAt, order.status === "collected" ? order.closedAt : null];
  const move: Transition = reduced ? { duration: 0 } : tween.state;

  return (
    <LayoutGroup id={group}>
      <div className={cx("relative", className)}>
        {/* The track runs from the first stop's centre to the last one's, behind the stops. */}
        <div aria-hidden className="absolute inset-x-[12.5%] top-[10px] h-[2px] bg-line-strong" />
        {[0, 1, 2].map((i) => {
          const filled = states[i + 1] !== "future";
          return (
            <m.div
              key={i}
              aria-hidden
              className="absolute top-[9.5px] h-[3px] w-1/4 origin-left bg-ink"
              style={{ left: `${12.5 + i * 25}%` }}
              initial={false}
              animate={{ scaleX: filled ? 1 : 0 }}
              transition={move}
            />
          );
        })}

        <ol role="list" className="relative grid grid-cols-4">
          {statusTrackStops.map((label, i) => {
            const state = states[i]!;
            const at = state !== "future" ? times[i] : null;
            return (
              <li
                key={label}
                role="listitem"
                aria-current={state === "current" ? "step" : undefined}
                className="flex min-w-0 flex-col items-center text-center"
              >
                <span aria-hidden className="relative grid size-[22px] place-items-center">
                  <Stop state={state} move={move} />
                </span>
                <span className={cx("mt-1.5 text-meta font-semibold whitespace-nowrap", state === "future" ? "text-ink-2" : "text-ink")}>
                  {label}
                </span>
                {at && (
                  <time dateTime={at} className="text-meta text-ink-2 tabular-nums">
                    {formatTime(at)}
                  </time>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </LayoutGroup>
  );
}

/** Stops sit opaque on the slip (`--paper`), so the track never shows through a ring. */
const paper = "bg-[var(--paper,var(--surface))] transition-colors duration-300 ease-out-strong motion-reduce:transition-none";

function Stop({ state, move }: { state: StopState; move: Transition }) {
  if (state === "done") {
    // The check is cut out of the disc in the slip's own colour: `on-primary` on a plain fiş,
    // `success` on a Hazır one (where the disc itself turns `on-success`).
    return (
      <span className="grid size-[14px] place-items-center rounded-full bg-ink text-[var(--paper,var(--on-primary))]">
        <Check size={10} strokeWidth={2} absoluteStrokeWidth aria-hidden />
      </span>
    );
  }
  if (state === "current") {
    return (
      <m.span
        layoutId="stage"
        transition={move}
        className={cx("grid size-[22px] place-items-center rounded-full border-2 border-ink", paper)}
      >
        <span className="size-2 rounded-full bg-ink" />
      </m.span>
    );
  }
  return <span className={cx("size-3 rounded-full border-[1.5px] border-line-strong", paper)} />;
}
