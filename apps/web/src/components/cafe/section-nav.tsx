"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, Segmented, type SegmentedItem } from "@/components/ui";

export type CafeSectionId = "menu" | "aski" | "masa";

const LABELS: Record<CafeSectionId, string> = { menu: "Menü", aski: "Askı", masa: "Masa" };

/**
 * The line under the sticky bar where a section counts as "current": header + bar + 64px. That
 * is more than the gap between two sections (32px phone, 48px desktop), so the tab flips as the
 * previous section leaves view, not a beat after.
 */
function spyLine(): number {
  const root = getComputedStyle(document.documentElement);
  const header = Number.parseFloat(root.getPropertyValue("--header-h")) || 56;
  const seg = Number.parseFloat(root.getPropertyValue("--seg-h")) || 48;
  return header + seg + 64;
}

/**
 * Scroll-spy for the café sections (design-system.md §9.3 item 6). On every scrolled frame the
 * section whose top has passed the line under the sticky bar is current; at the very bottom the
 * last one wins. (An IntersectionObserver missed tall sections: their ratio never crosses a
 * threshold again, so "Askı" stayed lit through the whole Masa feed.)
 * While a click is scrolling the page, the clicked tab holds, and it lets go only once the
 * target has landed, then the geometry decides again.
 */
export function useScrollSpy(ids: readonly CafeSectionId[]) {
  const [active, setActive] = useState<CafeSectionId>(ids[0] ?? "menu");
  const lock = useRef<number | null>(null);
  const pickRef = useRef<() => void>(() => {});
  const reduce = useReducedMotion();
  const key = ids.join(",");

  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    let line = spyLine();
    let frame = 0;
    const pick = () => {
      frame = 0;
      if (lock.current !== null) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(ids[ids.length - 1]!);
        return;
      }
      let current: CafeSectionId = ids[0]!;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id as CafeSectionId;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(pick);
    };
    const onResize = () => {
      line = spyLine();
      schedule();
    };
    pickRef.current = pick;
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    pick();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      pickRef.current = () => {};
    };
    // `key` stands for `ids`.
  }, [key]);

  const go = useCallback(
    (id: CafeSectionId, opts: { focus?: boolean; target?: HTMLElement | null } = {}) => {
      const section = document.getElementById(id);
      const target = opts.target ?? section;
      if (!target) return;
      setActive(id);
      if (lock.current !== null) window.clearTimeout(lock.current);
      const release = () => {
        if (lock.current !== null) window.clearTimeout(lock.current);
        lock.current = null;
        window.removeEventListener("scrollend", onEnd);
        pickRef.current();
      };
      // A smooth scroll can report scrollend early (an interrupted step); only a landed target
      // releases the tab. The timeout is the backstop for browsers without scrollend.
      const landed = () => {
        const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        return atBottom || Math.abs(target.getBoundingClientRect().top - margin) <= 2;
      };
      function onEnd() {
        if (landed()) release();
      }
      lock.current = window.setTimeout(release, reduce ? 50 : 1200);
      window.addEventListener("scrollend", onEnd);
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      if (opts.focus !== false && section) section.focus({ preventScroll: true });
      try {
        window.history.replaceState(window.history.state, "", `#${opts.target?.id || id}`);
      } catch {
        // Some embedded browsers refuse replaceState; the hash is a nicety.
      }
    },
    [reduce],
  );

  return { active, go };
}

/**
 * The sticky "Menü · Askı · Masa" bar: nav anchors (so they work with no JS and open in a new
 * tab), smooth scrolling on click (instant under reduced motion).
 */
export function SectionNav({
  ids,
  active,
  onGo,
  className,
}: {
  ids: readonly CafeSectionId[];
  active: CafeSectionId;
  onGo: (id: CafeSectionId) => void;
  className?: string;
}) {
  const items: SegmentedItem[] = ids.map((id) => ({ id, label: LABELS[id], href: `#${id}` }));
  return (
    <div
      className={cx(
        className,
        "sticky top-[var(--header-h)] z-20 -mx-4 border-b border-line bg-bg px-4 [background:var(--grain),var(--bg)] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0",
      )}
      // Plain clicks scroll smoothly from here; modified clicks keep the anchor's own behaviour.
      onClickCapture={(event) => {
        const a = (event.target as HTMLElement).closest("a");
        if (!a || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
      }}
    >
      {/* The bar draws its own full-bleed rule, so the control's hairline is dropped. */}
      <Segmented
        id="kafe"
        label="Kafe bölümleri"
        items={items}
        value={active}
        onChange={(id) => onGo(id as CafeSectionId)}
        className="shadow-none!"
      />
    </div>
  );
}
