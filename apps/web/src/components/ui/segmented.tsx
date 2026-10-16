"use client";

import { formatNumber } from "@peni/brand/format";
import * as m from "motion/react-m";
import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import { spring } from "@/lib/motion";
import { colorMotion, cx, focusRingInset, tappable } from "./cx";

export interface SegmentedItem {
  id: string;
  label: string;
  /** Rendered as "Yeni (2)". */
  count?: number;
  /** Give every item an `href` to render nav anchors instead of tabs (the café page's scroll-spy). */
  href?: string;
}

export interface SegmentedProps {
  /** Unique per page: it scopes the indicator's `layoutId` ("seg-{id}") and the tab/panel ids. */
  id: string;
  items: readonly SegmentedItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the tablist or nav ("Kafe bölümleri", "Görünüm"). */
  label?: string;
  /**
   * `underline` (default): equal-weight labels over a `line` hairline with a 2px ink underline
   * under the active one — the café page, the staff board and staff sections.
   * `track`: a radius-10 `surface-2` track whose active key is `surface` with a 2px ink border
   * (the choice-chip selection) — compact settings like Profil "Görünüm".
   */
  variant?: "underline" | "track";
  /**
   * Tabs point `aria-controls` at `segmentedPanelId(id, item.id)`. Leave it off unless the panels
   * exist with those ids (and `aria-labelledby={segmentedTabId(id, item.id)}`).
   */
  controlsPanels?: boolean;
  className?: string;
}

export const segmentedTabId = (id: string, itemId: string) => `${id}-tab-${itemId}`;
export const segmentedPanelId = (id: string, itemId: string) => `${id}-panel-${itemId}`;

/** A15: the indicator glides on `spring.snappy` with no bounce; instant under reduced motion (MotionConfig). */
const indicatorTransition = { ...spring.snappy, bounce: 0 };

/**
 * Segmented control (design-system.md §12.2): 48px tall, `role="tablist"` with roving focus
 * (← → Home End move and select), or a `<nav>` of anchors when the items carry `href`.
 * Labels never shift: both states are `text-button` 600; only the colour changes.
 */
export function Segmented({
  id,
  items,
  value,
  onChange,
  label,
  variant = "underline",
  controlsPanels = false,
  className,
}: SegmentedProps) {
  const refs = useRef(new Map<string, HTMLElement>());
  const asNav = items.length > 0 && items.every((i) => i.href != null);
  const track = variant === "track";

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (asNav) return;
    const index = items.findIndex((i) => i.id === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = items[next]!;
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  const segments = items.map((item) => {
    const active = item.id === value;
    const content = (
      <>
        {active && (
          <m.span
            layoutId={`seg-${id}`}
            transition={indicatorTransition}
            aria-hidden
            className={
              track
                ? "absolute inset-1 -z-10 rounded-[7px] border-2 border-ink bg-surface"
                : "absolute inset-x-2 bottom-0 h-0.5 bg-ink"
            }
          />
        )}
        <span className="truncate">
          {item.label}
          {item.count != null && <span className="tabular-nums"> ({formatNumber(item.count)})</span>}
        </span>
      </>
    );
    const segmentClass = cx(
      "relative isolate flex h-12 min-w-0 flex-1 basis-auto items-center justify-center px-3 text-button whitespace-nowrap",
      tappable,
      colorMotion,
      // Inset ring: the track scrolls horizontally on narrow screens, which clips anything outside it.
      "rounded-[10px]",
      focusRingInset,
      active ? "text-ink" : "text-ink-2 hover:text-ink",
    );
    const setRef = (el: HTMLElement | null) => {
      if (el) refs.current.set(item.id, el);
      else refs.current.delete(item.id);
    };

    if (asNav) {
      return (
        <a
          key={item.id}
          ref={setRef}
          href={item.href}
          aria-current={active ? "true" : undefined}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            onChange(item.id);
          }}
          className={segmentClass}
        >
          {content}
        </a>
      );
    }
    return (
      <button
        key={item.id}
        ref={setRef}
        type="button"
        role="tab"
        id={segmentedTabId(id, item.id)}
        aria-selected={active}
        aria-controls={controlsPanels ? segmentedPanelId(id, item.id) : undefined}
        tabIndex={active ? 0 : -1}
        onClick={() => onChange(item.id)}
        className={segmentClass}
      >
        {content}
      </button>
    );
  });

  const trackClass = cx(
    "relative flex w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    // The hairline is an inset shadow, not a border: a border sits outside the scroll box and
    // would clip the underline, which is drawn over it.
    track ? "rounded-[10px] bg-surface-2" : "shadow-[inset_0_-1px_0_var(--line)]",
    className,
  );

  if (asNav) {
    return (
      <nav aria-label={label} className={trackClass}>
        {segments}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label={label} aria-orientation="horizontal" onKeyDown={onKeyDown} className={trackClass}>
      {segments}
    </div>
  );
}
