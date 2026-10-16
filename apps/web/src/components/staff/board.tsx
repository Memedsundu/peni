"use client";

import type { OrderDTO } from "@peni/api";
import { staffCopy } from "@peni/brand/copy";
import type { CafeHue } from "@peni/brand/tokens";
import { AnimatePresence, LayoutGroup, useIsPresent, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useRef, useState, type ReactNode, type Ref } from "react";
import { MD_UP, Segmented, Skeleton, cx, segmentedPanelId, segmentedTabId, useMediaQuery } from "@/components/ui";
import { tween } from "@/lib/motion";
import { BOARD_COLUMNS, COLUMN_KEY, type BoardColumn, type BumpAction } from "./model";
import { StaffTicket } from "./ticket";

export interface StaffBoardProps {
  columns: Record<BoardColumn, OrderDTO[]>;
  slug: string;
  hue: CafeHue | null;
  posKind: "standalone" | "shelby";
  now: number;
  /** Orders that arrived during this shift (id → arrival time, ms): they show the A13 bar. */
  arrivals: ReadonlyMap<string, number>;
  onBump: (order: OrderDTO, action: BumpAction) => void;
  onReject: (order: OrderDTO) => void;
}

const SEG_ID = "tezgah-kolon";

/**
 * Tezgâh (design-system.md §9.10).
 * - ≥768: three columns headed in legend caps, "YENİ · 2", "HAZIRLANIYOR · 1", "HAZIR · 0".
 * - <768: a sticky Segmented "Yeni (2) · Hazırlanıyor (1) · Hazır (0)" over one column.
 * - Empty columns: one sentence centred in a 120px well.
 * - A12 `ticket-move`: tickets carry `layout` inside `<AnimatePresence mode="popLayout">`
 *   (`tween.move`): a bumped ticket leaves its column at once and the ones below slide up; a
 *   ticket ignores taps until its own move has finished. (No shared `layoutId` glide between
 *   columns: motion holds the old copy in place for the whole glide, which delays the slide
 *   of the tickets under it.) Under reduced motion (MotionConfig "user") moves are instant.
 * - From 768px each column's header stays in view (under the sticky section bar) through a
 *   rush, when every ticket looks alike.
 * - A bump made from the keyboard keeps the place: focus moves to the next ticket's primary in
 *   the same column, or to the column itself when it has emptied.
 */
export function StaffBoard(props: StaffBoardProps) {
  const wide = useMediaQuery(MD_UP);
  const [tab, setTab] = useState<BoardColumn>("submitted");
  const label = (c: BoardColumn) => staffCopy.columns[COLUMN_KEY[c]];

  if (wide) {
    return (
      <LayoutGroup id="tezgah">
        <div className="grid grid-cols-3 items-start gap-4 lg:gap-6">
          {BOARD_COLUMNS.map((c) => (
            <section key={c} aria-labelledby={`kolon-${c}`} className="min-w-0">
              <h2
                id={`kolon-${c}`}
                tabIndex={-1}
                className="sticky top-[calc(var(--header-h)+var(--section-bar-h,0px))] z-10 mb-4 flex min-h-11 items-end border-b border-line pb-3 legend text-ink outline-none [background:var(--grain),var(--bg)]"
              >
                {staffCopy.columnHeader(label(c), props.columns[c].length)}
              </h2>
              <Column column={c} {...props} fallbackId={`kolon-${c}`} />
            </section>
          ))}
        </div>
      </LayoutGroup>
    );
  }

  return (
    <LayoutGroup id="tezgah">
      <div className="sticky top-(--header-h) z-20 -mx-4 px-4 py-2 [background:var(--grain),var(--bg)] sm:-mx-6 sm:px-6">
        <Segmented
          id={SEG_ID}
          label={staffCopy.sections.tezgah}
          items={BOARD_COLUMNS.map((c) => ({ id: c, label: label(c), count: props.columns[c].length }))}
          value={tab}
          onChange={(id) => setTab(id as BoardColumn)}
          controlsPanels
          variant="track"
        />
      </div>
      <section
        id={segmentedPanelId(SEG_ID, tab)}
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={segmentedTabId(SEG_ID, tab)}
        className="pt-4 outline-none"
      >
        {/* Keyed by tab: switching tabs swaps the list outright, with no exit animations. */}
        <Column key={tab} column={tab} {...props} twoUp fallbackId={segmentedPanelId(SEG_ID, tab)} />
      </section>
    </LayoutGroup>
  );
}

function Column({
  column,
  columns,
  twoUp = false,
  fallbackId,
  slug,
  hue,
  posKind,
  now,
  arrivals,
  onBump,
  onReject,
}: StaffBoardProps & { column: BoardColumn; twoUp?: boolean; fallbackId: string }) {
  const orders = columns[column];
  const list = useRef<HTMLUListElement>(null);

  const bump = (order: OrderDTO, action: BumpAction) => {
    const active = document.activeElement;
    const byKeyboard = active instanceof HTMLElement && list.current?.contains(active) && active.matches(":focus-visible");
    const index = orders.findIndex((o) => o.id === order.id);
    onBump(order, action);
    // Once the board has re-rendered without the ticket.
    if (byKeyboard) requestAnimationFrame(() => requestAnimationFrame(() => focusAfterBump(list.current, index, fallbackId)));
  };

  return (
    <>
      {orders.length === 0 && (
        <p className="flex h-[120px] items-center justify-center rounded-[14px] bg-surface-2 px-6 text-center text-meta text-ink-2">
          {staffCopy.columnEmpty[COLUMN_KEY[column]]}
        </p>
      )}
      <ul ref={list} className={cx("relative grid gap-4", twoUp && "sm:grid-cols-2", orders.length === 0 && "hidden")}>
        {/* A ticket that leaves fades out of the flow at once (popLayout) while the ones under it
            slide up; one that arrives (a bump from another column, or a new order) fades in. */}
        <AnimatePresence mode="popLayout" initial={false}>
          {orders.map((order) => (
            <BoardItem key={order.id}>
              <StaffTicket
                order={order}
                slug={slug}
                hue={hue}
                posKind={posKind}
                now={now}
                arrivedAt={arrivals.get(order.id)}
                onBump={(action) => bump(order, action)}
                onReject={() => onReject(order)}
              />
            </BoardItem>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

const ENTER = { opacity: 1, scale: 1 };
const EXIT = { opacity: 0, scale: 0.96, pointerEvents: "none" as const };
/** Reduced motion: nothing scales or slides; tickets fade in 150ms. */
const EXIT_REDUCED = { opacity: 0, pointerEvents: "none" as const, transition: { duration: 0.15 } };

/** `ref` reaches the `<li>`: AnimatePresence's popLayout measures and pops the element through it. */
function BoardItem({ ref, children }: { ref?: Ref<HTMLLIElement>; children: ReactNode }) {
  const [moving, setMoving] = useState(false);
  const reduce = useReducedMotion();
  // A ticket on its way out (its fade has no layout animation) is as untouchable as one sliding.
  const present = useIsPresent();
  return (
    <m.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0 }}
      animate={ENTER}
      exit={reduce ? EXIT_REDUCED : EXIT}
      transition={reduce ? { duration: 0.15 } : tween.move}
      onLayoutAnimationStart={() => setMoving(true)}
      onLayoutAnimationComplete={() => setMoving(false)}
      // Taps never land on a moving ticket (A12).
      style={{ pointerEvents: moving || !present ? "none" : undefined }}
      data-leaving={present ? undefined : ""}
      className="min-w-0"
    >
      {children}
    </m.li>
  );
}

/** The next ticket's primary (the one that slid into the bumped ticket's place), else the column. */
function focusAfterBump(list: HTMLUListElement | null, index: number, fallbackId: string) {
  const items = list ? [...list.children].filter((li) => !li.hasAttribute("data-leaving")) : [];
  const next = items[Math.min(Math.max(index, 0), items.length - 1)];
  const target = next?.querySelector<HTMLElement>("[data-primary]") ?? document.getElementById(fallbackId);
  target?.focus();
}

/** Loading: skeleton columns with the real geometry (aria-busy sits on the region). */
export function BoardSkeleton() {
  const wide = useMediaQuery(MD_UP);
  const ticket = (k: number, h: string) => <Skeleton key={k} radius={14} className={cx("w-full", h)} />;
  if (!wide) {
    return (
      <div aria-hidden>
        {/* The column switcher is the `track` Segmented: a 48px rounded well. */}
        <div className="py-2">
          <Skeleton radius={10} className="h-12 w-full" />
        </div>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          {ticket(1, "h-[264px]")}
          {ticket(2, "h-[220px]")}
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="grid grid-cols-3 items-start gap-4 lg:gap-6">
      {[0, 1, 2].map((c) => (
        <div key={c}>
          <div className="mb-4 flex min-h-11 items-end border-b border-line pb-3">
            <Skeleton className={cx("h-4", c === 1 ? "w-36" : "w-20")} />
          </div>
          <div className="grid gap-4">
            {ticket(1, c === 2 ? "h-[220px]" : "h-[264px]")}
            {c === 0 && ticket(2, "h-[220px]")}
          </div>
        </div>
      ))}
    </div>
  );
}
