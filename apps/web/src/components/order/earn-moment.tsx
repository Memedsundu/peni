"use client";

import { orderCopy } from "@peni/brand/copy";
import * as m from "motion/react-m";
import { useState } from "react";
import { Coin, type CoinCafe } from "@/components/brand";
import { NumberRoll } from "@/components/ui";

/** How the earn line shows (decided by the page before it first paints, see `order-page`). */
export type EarnShow = "pending" | "static" | "strike";

const FADE_IN = { opacity: 1 } as const;
const FROM_CLEAR = { opacity: 0 } as const;
/** The words come in as the coin falls, and are fully there when it lands (350ms) and the number rolls. */
const STRIKE_TEXT = { duration: 0.3 } as const;
const REVEAL = { duration: 0.15 } as const;

/**
 * The earn moment on a collected fiş (§9.4, A6 coin-strike): a 28px coin of the café drops in,
 * and on landing "+2 peni cüzdanında" rolls up from 0 with `trend={1}`. The words fade in with
 * the coin, so a bare "0" is never read on its own.
 *
 * - `strike`: the moment plays (live, or the first time this order's peni is seen).
 * - `static`: it already played for this order; the line is simply there (a 150ms reveal,
 *   since it arrives just after hydration).
 * - `pending`: the browser hasn't decided yet (server render, first client render). An empty
 *   row of the same height holds the place, so nothing shifts and nothing flickers.
 *
 * Reduced motion: the coin fades in over 150ms and the number swaps (Coin and NumberFlow both
 * honour it). The line is decorative for screen readers; the fiş's live region says it in words.
 */
export function EarnMoment({ peni, cafe, show }: { peni: number; cafe: CoinCafe; show: EarnShow }) {
  if (show === "pending") return <div aria-hidden className="h-7" />;
  // Keyed: `landed` starts again from scratch whenever the mode changes.
  return <EarnLine key={show} peni={peni} cafe={cafe} strike={show === "strike"} />;
}

function EarnLine({ peni, cafe, strike }: { peni: number; cafe: CoinCafe; strike: boolean }) {
  const [landed, setLanded] = useState(!strike);
  const text = orderCopy.earned(peni);
  // "+2 peni cüzdanında": the number rolls, the words around it stay put.
  const tail = text.replace(/^\+?[\d.]+\s*/, " ");

  return (
    <m.p aria-hidden className="flex h-7 items-center gap-2.5" initial={strike ? false : FROM_CLEAR} animate={FADE_IN} transition={REVEAL}>
      <Coin size={28} cafe={cafe} animate={strike ? "strike" : null} onLand={() => setLanded(true)} />
      <m.span
        className="text-item text-peni-ink tabular-nums"
        initial={strike ? FROM_CLEAR : false}
        animate={FADE_IN}
        transition={STRIKE_TEXT}
      >
        <NumberRoll value={landed ? peni : 0} kind="peni" signed trend={1} animated={strike} />
        {tail}
      </m.span>
    </m.p>
  );
}
