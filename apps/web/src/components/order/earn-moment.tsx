"use client";

import { orderCopy } from "@peni/brand/copy";
import { useState } from "react";
import { Coin, type CoinCafe } from "@/components/brand";
import { NumberRoll } from "@/components/ui";

/**
 * The earn moment on a collected fiş (§9.4, A6 coin-strike): a 28px coin of the café drops
 * in, and on landing "+2 peni cüzdanında" rolls up with `trend={1}`. Without `animate` it is
 * simply there (the moment already played for this order). Reduced motion: the coin fades in
 * over 150ms and the number swaps (Coin and NumberFlow both honour it).
 *
 * The line is decorative for screen readers; the fiş's live region says it in words.
 */
export function EarnMoment({ peni, cafe, animate }: { peni: number; cafe: CoinCafe; animate: boolean }) {
  const [landed, setLanded] = useState(!animate);
  const text = orderCopy.earned(peni);
  // "+2 peni cüzdanında": the number rolls, the words around it stay put.
  const tail = text.replace(/^\+?[\d.]+\s*/, " ");

  return (
    <p aria-hidden className="flex items-center gap-2.5">
      <Coin size={28} cafe={cafe} animate={animate ? "strike" : null} onLand={() => setLanded(true)} />
      <span className="text-item text-peni-ink tabular-nums">
        <NumberRoll value={landed ? peni : 0} kind="peni" signed trend={1} animated={animate} />
        {tail}
      </span>
    </p>
  );
}
