"use client";

import { useReducedMotionConfig, type TargetAndTransition, type Transition } from "motion/react";
import * as m from "motion/react-m";
import { ease } from "@/lib/motion";
import { cx } from "./_cx";

const FROM: TargetAndTransition = { scale: 1.6, opacity: 0 };
const TO: TargetAndTransition = { scale: 1, opacity: 1 };
const STAMP: Transition = { duration: 0.24, ease: ease.outStrong };

/**
 * The HAZIR stamp (design-system.md §6.3, A11): a double-ruled plate, tilted −4°, in the fiş's
 * text colour. Decorative; the fiş headline "Hazır!" says it in words.
 *
 * `animate` (default true) stamps it down (scale 1.6->1 with a fade, 240ms) when it mounts,
 * i.e. when the order turns ready while the customer is looking. Pass false when the page
 * opens on an order that is already ready. Under reduced motion it just appears.
 */
export function HazirStamp({ animate = true, className }: { animate?: boolean; className?: string }) {
  const reduced = useReducedMotionConfig() === true;
  return (
    <m.span
      aria-hidden
      className={cx(
        "plate inline-block rotate-[-4deg] rounded-[6px] border-[3px] border-double border-current px-3 py-1 text-[22px] leading-none",
        className,
      )}
      initial={animate && !reduced ? FROM : false}
      animate={TO}
      transition={STAMP}
    >
      HAZIR
    </m.span>
  );
}
