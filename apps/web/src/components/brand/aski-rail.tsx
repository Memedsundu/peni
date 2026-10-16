"use client";

import { askiCaption, type AskiCaptionInput } from "@peni/brand/copy";
import { cssVar } from "@peni/brand/tokens";
import { askiItemFor, HOOK_STROKE, ITEM, paintProps, RAIL_TAG, railLayout, type ItemKind, type RailSize } from "@peni/brand/shapes";
import { useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ease, spring } from "@/lib/motion";
import { cx } from "./_cx";

/*
 * Askı rafı, the hook rail (design-system.md §6.2): one hanging glass is one ikram waiting
 * to be taken. The SVG is decorative; `AskiCaption` under it is the accessible text.
 *
 * Motion is for one's own action only (D7):
 * - cup-hang (A8) plays ONLY on the donor's own screen after their own donation, and on the
 *   staff till: bump `hangSignal`.
 * - cup-take (A9) plays ONLY inside the taker's own take sheet: bump `takeSignal`.
 * - Every other change (a fetch that brings a new count) re-renders with no animation.
 * The hook never sways: hooks are static paths outside every animated group.
 */

/**
 * Bump `n` in the same render that raises `count`. `count` is how many of the new items are
 * the donor's own (default 1); `match: true` adds the café-match whole item, which hangs
 * 120ms later (D9: only whole items are ever drawn). A plain number means `{ n }`.
 */
export type HangSignal = number | { n: number; count?: number; match?: boolean };

export interface AskiRailProps {
  /** `itemsAvailable`. */
  count: number;
  /** From `referenceItemName` via `askiItemFor()`: the glyph must match the caption ("7 çay" -> glasses). */
  item: ItemKind;
  /** md: 28-unit slots, as many as fit (max 12). sm: 6 slots at .75 (home cards). */
  size: RailSize;
  /** Caps the slots (the take sheet's mini rail is md with 6). */
  maxSlots?: number;
  /** A8 cup-hang. */
  hangSignal?: HangSignal;
  /** A9 cup-take: bump to lift the rightmost item off its hook. */
  takeSignal?: number;
  /** A9: the item has gone (200ms; 150ms reduced). Close the take sheet here. */
  onTakeComplete?: () => void;
  className?: string;
}

const HANG_FROM = { y: -18, rotate: 10, opacity: 0 } as const;
const HANG_TO = { y: 0, rotate: 0, opacity: 1 } as const;
const REST = { y: 0, opacity: 1 } as const;
const TAKEN = { y: -8, opacity: 0 } as const;
const TAKEN_REDUCED = { y: 0, opacity: 0 } as const;
const MATCH_DELAY = 0.12;
/** Items rotate and lift about their top centre: the hook pivot. */
const ORIGIN = { originX: 0.5, originY: 0 } as const;

function hangTransition(delay: number, reduced: boolean) {
  if (reduced) return { duration: 0.15, delay };
  return { ...spring.hang, delay, opacity: { duration: 0.12, delay } };
}

/** md rails measure their box; before the first measurement they assume this many slots. */
const GUESS_SLOTS = 10;

export function AskiRail({ count, item, size, maxSlots, hangSignal, takeSignal, onTakeComplete, className }: AskiRailProps) {
  const reduced = useReducedMotionConfig() === true;
  const box = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(box, size === "md" ? (maxSlots ?? GUESS_SLOTS) * 28 : 0);
  const rail = railLayout(width, size, { maxSlots, count });
  const shape = ITEM[item];

  /* ---------- A8: which slots hang, fixed at the moment the signal fires ---------- */
  // Kept only while `count` is the count it was fired with: a later change (someone else's
  // donation, a refetch) must never replay a hang (D7).
  const signal = normaliseHang(hangSignal);
  const [hang, setHang] = useState<HangState | null>(null);
  const [seenHang, setSeenHang] = useState(signal.n);
  if (signal.n !== seenHang) {
    setSeenHang(signal.n);
    const total = Math.max(0, signal.count) + (signal.match ? 1 : 0);
    if (total === 0) setHang(null);
    else if (rail.tag) setHang({ n: signal.n, count, slots: [], matchSlot: null, tag: true });
    else {
      const slots = range(Math.max(0, rail.items - total), rail.items);
      setHang({ n: signal.n, count, slots, matchSlot: signal.match ? (slots[slots.length - 1] ?? null) : null, tag: false });
    }
  } else if (hang && hang.count !== count) {
    setHang(null);
  }

  /* ---------- A9: the rightmost item lifts off, until the count changes ---------- */
  const [take, setTake] = useState<TakeState | null>(null);
  const [seenTake, setSeenTake] = useState(takeSignal);
  const finished = useRef<number | null>(null);
  if (takeSignal !== seenTake) {
    setSeenTake(takeSignal);
    // slot −1: nothing on the rail to lift (only a "+N" tag); it finishes at once.
    setTake({ id: takeSignal ?? 0, slot: rail.items - 1, count });
  } else if (take && take.count !== count) {
    setTake(null);
  }
  const taking = take ? take.slot : null;
  const finishTake = () => {
    if (!take || finished.current === take.id) return;
    finished.current = take.id;
    onTakeComplete?.();
  };
  useEffect(() => {
    if (take && take.slot < 0) finishTake();
    // Runs when a take starts; `finishTake` reads the take it belongs to.
  }, [take]);

  const hooks = (
    <g {...HOOK_STROKE} stroke={cssVar(HOOK_STROKE.stroke)}>
      {rail.hooks.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </g>
  );

  const items = range(0, rail.items).map((i) => {
    const hanging = hang && hang.slots.includes(i) ? hang : null;
    const delay = hanging && hanging.matchSlot === i ? MATCH_DELAY : 0;
    const isTaken = taking === i;
    return (
      <g key={hanging ? `${i}-h${hanging.n}` : i} transform={`translate(${rail.cx[i]} ${rail.pivotY})`}>
        <m.g
          style={ORIGIN}
          initial={hanging ? (reduced ? { opacity: 0 } : HANG_FROM) : false}
          animate={isTaken ? (reduced ? TAKEN_REDUCED : TAKEN) : hanging && !reduced ? HANG_TO : REST}
          transition={
            isTaken
              ? reduced
                ? { duration: 0.15 }
                : { duration: 0.2, ease: ease.outStrong }
              : hanging
                ? hangTransition(delay, reduced)
                : { duration: 0 }
          }
          // Only the lift itself ends a take (a hang still settling must not).
          onAnimationComplete={isTaken ? (def) => (def === TAKEN || def === TAKEN_REDUCED) && finishTake() : undefined}
        >
          <g transform={shape.offsetY ? `translate(0 ${shape.offsetY})` : undefined}>
            {shape.els.map((el, k) =>
              el.kind === "path" ? <path key={k} {...paintProps(el, cssVar)} /> : <circle key={k} {...paintProps(el, cssVar)} />,
            )}
          </g>
        </m.g>
      </g>
    );
  });

  const tag = rail.tag && (
    <g key={hang?.tag ? `tag-h${hang.n}` : "tag"} transform={`translate(${rail.cx[rail.tag.slot]} ${rail.pivotY})`}>
      <m.g
        style={ORIGIN}
        initial={hang?.tag ? (reduced ? { opacity: 0 } : HANG_FROM) : false}
        animate={hang?.tag && !reduced ? HANG_TO : REST}
        transition={hang?.tag ? hangTransition(0, reduced) : { duration: 0 }}
      >
        <g transform={RAIL_TAG.transform}>
          <rect
            x={RAIL_TAG.rect.x}
            y={RAIL_TAG.rect.y}
            width={RAIL_TAG.rect.width}
            height={RAIL_TAG.rect.height}
            rx={RAIL_TAG.rect.rx}
            fill={cssVar(RAIL_TAG.rect.fill)}
            stroke={cssVar(RAIL_TAG.rect.stroke)}
            strokeWidth={RAIL_TAG.rect.strokeWidth}
          />
          <text
            x={RAIL_TAG.text.x}
            y={RAIL_TAG.text.y}
            textAnchor={RAIL_TAG.text.textAnchor}
            fontSize={RAIL_TAG.text.fontSize}
            fontWeight={RAIL_TAG.text.fontWeight}
            fill={cssVar(RAIL_TAG.text.fill)}
            className="font-sans tabular-nums"
          >
            {rail.tag.label}
          </text>
        </g>
      </m.g>
    </g>
  );

  const svg = (
    <svg
      viewBox={rail.viewBox}
      width={rail.pxWidth}
      height={rail.pxHeight}
      aria-hidden
      focusable="false"
      className="block h-auto max-w-full shrink-0 overflow-visible"
    >
      <g fill={cssVar("hook")}>
        <rect x={rail.rail.x} y={rail.rail.y} width={rail.rail.width} height={rail.rail.height} rx={rail.rail.rx} />
        {rail.finials.map((f, i) => (
          <circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
        ))}
      </g>
      {/* Simit hangs through its hole: its hooks are drawn AFTER the items, still static. */}
      {!shape.hookOnTop && hooks}
      {items}
      {tag}
      {shape.hookOnTop && hooks}
    </svg>
  );

  return (
    <div ref={box} className={cx(size === "md" ? "w-full" : "inline-block", className)}>
      {svg}
    </div>
  );
}

/**
 * The rail caption (§6.2), the accessible text for the rail:
 * "Askıda 7 çay bekliyor" (`text-item`), "İsteyen alır, günde bir tane." and the weekly line
 * (`meta ink-2`), which hides ikram counts below 3 (D8).
 */
export function AskiCaption({ askida, className }: { askida: AskiCaptionInput; className?: string }) {
  const c = askiCaption(askida);
  return (
    <div className={cx("flex flex-col gap-0.5", className)}>
      <p className="text-item text-ink">{c.line1}</p>
      <p className="text-meta text-ink-2">{c.line2}</p>
      {c.line3 && <p className="text-meta text-ink-2">{c.line3}</p>}
    </div>
  );
}

/** `{ count, item }` for an `AskidaDTO` (or anything with its two fields). */
export function askiRailProps(askida: { itemsAvailable: number; referenceItemName: string | null | undefined }): {
  count: number;
  item: ItemKind;
} {
  return { count: askida.itemsAvailable, item: askiItemFor(askida.referenceItemName) };
}

/* ------------------------------------------------------------------------------------------ */

interface HangState {
  n: number;
  /** `count` when the signal fired. */
  count: number;
  slots: number[];
  matchSlot: number | null;
  tag: boolean;
}

interface TakeState {
  /** The `takeSignal` value that started it. */
  id: number;
  slot: number;
  count: number;
}

function normaliseHang(s: HangSignal | undefined): { n: number; count: number; match: boolean } {
  if (s === undefined) return { n: 0, count: 1, match: false };
  if (typeof s === "number") return { n: s, count: 1, match: false };
  return { n: s.n, count: s.count ?? 1, match: Boolean(s.match) };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The box's content width, kept current with a ResizeObserver; `guess` until measured, 0 = don't measure. */
function useBoxWidth(ref: React.RefObject<HTMLDivElement | null>, guess: number): number {
  const [width, setWidth] = useState(guess);
  const measured = guess !== 0;
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !measured) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, measured]);
  return width;
}
