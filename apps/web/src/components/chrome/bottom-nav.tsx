"use client";

import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { spring, tween } from "@/lib/motion";
import { useActiveOrder } from "./active-order";
import { useChromeLayer } from "./layer";
import { NAV_ITEMS, navKeyFor } from "./nav-items";

/**
 * Phone bottom nav (<768, design-system.md §8.2): 64px + safe area, four equal items, 24px icon
 * over a 13px label. Active: ink 600 label and a 2px ink bar above the icon. Siparişler carries
 * an 8px masa dot while an order is active (decorative; the header chip has the words).
 * It gives way to the café CartBar (A4): one floating layer at a time.
 */
export function BottomNav() {
  const pathname = usePathname();
  const current = navKeyFor(pathname);
  const { floating } = useChromeLayer();
  const { order } = useActiveOrder();
  const reduce = useReducedMotion();
  const hidden = floating !== "nav";

  return (
    <m.nav
      aria-label="Ana menü"
      inert={hidden}
      initial={false}
      // Both properties every time: the server never knows the motion preference, so the first
      // paint must be identical either way (y 0%, opacity 1) or hydration warns.
      animate={{ y: hidden && !reduce ? "100%" : "0%", opacity: hidden && reduce ? 0 : 1 }}
      transition={reduce ? { duration: 0.15 } : tween.ui}
      style={{ viewTransitionName: "bottom-nav" }}
      className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-[640px] grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[10px] text-meta transition-transform duration-150 ease-out-strong active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  active ? "font-semibold text-ink" : "text-ink-2"
                }`}
              >
                {active && (
                  <m.span
                    layoutId="bottom-nav"
                    transition={spring.snappy}
                    aria-hidden
                    className="absolute inset-x-0 top-0 mx-auto h-0.5 w-8 bg-ink"
                  />
                )}
                <span className="relative">
                  {item.icon({})}
                  {item.key === "siparisler" && order && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-1 size-2 rounded-full bg-masa ring-2 ring-surface"
                    />
                  )}
                </span>
                {/* An invisible 600 copy reserves the width, so the label never shifts on activation. */}
                <span className="grid leading-4">
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
                    {item.label}
                  </span>
                  <span className="col-start-1 row-start-1 text-center">{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </m.nav>
  );
}
