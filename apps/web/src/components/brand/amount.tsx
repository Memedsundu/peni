"use client";

import { goods as goodsOf, goodsLine, SEP, type RefItem } from "@peni/brand/format";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NumberRoll } from "@/components/ui/number-roll";
import { cx } from "./_cx";
import { Coin, type CoinCafe } from "./coin";
import { Approx } from "./glyphs";

/*
 * Amount (design-system.md §12.3): coin + NumberRoll + "peni" + Approx + goods.
 * "Amounts read as goods" (principle 2): "90 peni · <Approx/> 3 çay". Peni is Archivo with tabular
 * figures in rows (sm, md); the big wallet balance (lg) is Brygada, lining and tabular (§4.1).
 */

export interface AmountProps {
  peni: number;
  /** The café's reference items, cheapest first [G1]. Without them there is no goods part. */
  refItems?: readonly RefItem[] | null;
  /**
   * sm: 16px coin, body 600 ("Sende 90 peni · <Approx/> 3 çay" on café cards and chips).
   * md: 28px coin, `text-item`.
   * lg: wallet balance, `text-balance` "90" + " peni" in body, goods on their own line
   *     with both reference items ("<Approx/> 3 çay · 1 Türk kahvesi").
   */
  size?: "sm" | "md" | "lg";
  /** Show the coin. Default true. */
  coin?: boolean;
  /** Show the goods. Default true (and only when at least one whole item fits, D9). */
  goods?: boolean;
  /** Whose coin. Only the 56/96 layouts differ per café, so this is optional here. */
  cafe?: CoinCafe | null;
  /** Text between the coin and the number: "Sende ". */
  prefix?: React.ReactNode;
  /**
   * A6 coin-strike: the balance last seen, when it was lower than `peni` (see
   * `useLastSeenBalance`). The coin strikes, the number holds `from` until the coin lands,
   * then rolls up with `trend={1}`. Without a coin it rolls at once.
   */
  from?: number | null;
  className?: string;
}

/** " · " that never starts a line: the dot stays with the word before it. */
const NBSP_SEP = SEP.replace(/^ /, "\u00A0");

const SIZES = {
  sm: { coin: 16, gap: "gap-1.5", number: "text-body font-semibold", unit: "" },
  md: { coin: 28, gap: "gap-2", number: "text-item", unit: "" },
  lg: { coin: 28, gap: "gap-2.5", number: "font-display text-balance lining-nums", unit: "text-body" },
} as const;

export function Amount({ peni, refItems, size = "sm", coin = true, goods = true, cafe, prefix, from, className }: AmountProps) {
  const s = SIZES[size];
  const { shown, run, runId, landed } = useStrike(peni, from, coin);
  const goodsText = goods ? (size === "lg" ? goodsLine(peni, refItems) : goodsOf(peni, refItems)) : null;
  // A new strike remounts the coin (so it plays) and the number (so it starts at `from`
  // without rolling down to it first).
  const coinEl = coin && <Coin key={runId} size={s.coin} cafe={cafe} animate={run ? "strike" : null} onLand={landed} />;

  const number = (
    <span className={cx("whitespace-nowrap text-peni-ink tabular-nums", s.number)}>
      <NumberRoll key={runId} value={shown} kind="peni" trend={run ? 1 : undefined} />
      {size === "lg" ? <span className={cx("font-sans font-normal", s.unit)}> peni</span> : " peni"}
    </span>
  );

  if (size === "lg") {
    return (
      <span className={cx("inline-flex flex-col gap-1", className)}>
        <span className={cx("inline-flex items-center", s.gap)}>
          {coinEl}
          <span>
            {prefix}
            {number}
          </span>
        </span>
        {goodsText && (
          <span className="text-meta text-ink-2">
            <Approx />
            {`\u00A0${goodsText.split(SEP).join(NBSP_SEP)}`}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cx("inline-flex flex-wrap items-center gap-y-0.5", s.gap, className)}>
      {coinEl}
      {/* Plain inline text (not flex), so the spaces around " · " survive line starts. */}
      <span className="min-w-0">
        {prefix}
        {number}
        {goodsText && (
          <span className="text-meta text-ink-2">
            {NBSP_SEP}
            <Approx />
            {`\u00A0${goodsText}`}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The strike state. A strike starts when `from` arrives lower than `peni` (at mount, or later,
 * once `useLastSeenBalance` has read storage), holds the old value until the coin lands, then
 * shows `peni`. Later changes of `peni` roll as usual.
 */
interface StrikeRun {
  id: number;
  from: number;
  to: number;
  landed: boolean;
}

function useStrike(peni: number, from: number | null | undefined, coin: boolean) {
  const [run, setRun] = useState<StrikeRun | null>(from != null && from < peni ? { id: 1, from, to: peni, landed: false } : null);
  const [seenFrom, setSeenFrom] = useState(from);

  // A new `from` after mount starts a new strike (state adjusted during render, not in an effect).
  if (from !== seenFrom) {
    setSeenFrom(from);
    if (from != null && from < peni) setRun({ id: (run?.id ?? 0) + 1, from, to: peni, landed: false });
  }

  const landed = useCallback(() => setRun((r) => (r && !r.landed ? { ...r, landed: true } : r)), []);

  // No coin to wait for: roll on the next frame.
  useEffect(() => {
    if (!coin && run && !run.landed) {
      const t = requestAnimationFrame(landed);
      return () => cancelAnimationFrame(t);
    }
  }, [coin, run, landed]);

  // The strike belongs to the value it was started for; a later change of `peni` rolls as usual.
  const active = run !== null && run.to === peni ? run : null;
  const shown = active && !active.landed ? active.from : peni;
  return { shown, run: active, runId: run?.id ?? 0, landed };
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A6 trigger for the wallet: "a wallet balance higher than last seen (stored per café in
 * localStorage)". Returns the last seen balance when it is lower than `balance` (pass it to
 * `<Amount from>`), otherwise null; then remembers `balance`. Storage failures (private mode)
 * simply mean no strike.
 */
export function useLastSeenBalance(cafeSlug: string | null | undefined, balance: number | null | undefined): number | null {
  const [from, setFrom] = useState<number | null>(null);
  const lastKey = useRef<string | null>(null);
  useIsoLayoutEffect(() => {
    if (!cafeSlug || balance == null) return;
    const key = `peni.lastSeen.${cafeSlug}`;
    let previous: number | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      previous = raw === null ? null : Number(raw);
      window.localStorage.setItem(key, String(balance));
    } catch {
      return;
    }
    const sameKey = lastKey.current === key;
    lastKey.current = key;
    if (previous !== null && Number.isFinite(previous) && previous < balance) setFrom(previous);
    else if (!sameKey) setFrom(null);
  }, [cafeSlug, balance]);
  return from;
}
