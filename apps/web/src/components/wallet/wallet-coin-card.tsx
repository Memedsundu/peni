"use client";

import type { WalletCafeDTO } from "@peni/api";
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { formatNumber, goodsLine, SEP } from "@peni/brand/format";
import { Gift } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Approx, CafeHueBand, Coin, useLastSeenBalance } from "@/components/brand";
import { Button, NumberRoll, Skeleton } from "@/components/ui";

/*
 * One coin card in JETON KESESİ (design-system.md §9.6, §6.6, A6): a raised card with the café
 * colourway band on top, the café's 56px coin, its name and district, the balance in
 * `text-balance` ("90" + " peni"), the goods line [G1], "1 peni = ₺1, yalnız bu kafe için.",
 * then "Ismarla" (secondary) and "Kafeye git" (quiet).
 *
 * A6 coin-strike: when the balance is higher than the one last seen on this device, the coin
 * drops in and the number holds the old value until it lands, then rolls up. A change the
 * page made itself (a gift accepted here) is marked seen first (`markBalanceSeen`), so it just
 * rolls: that moment already had its coin flip on the gift fiş.
 */

/** Same key as `useLastSeenBalance` in @/components/brand. */
const seenKey = (slug: string) => `peni.lastSeen.${slug}`;

/** Record a balance as already seen, so the next render rolls to it without a strike. */
export function markBalanceSeen(cafeSlug: string, balance: number): void {
  try {
    window.localStorage.setItem(seenKey(cafeSlug), String(balance));
  } catch {
    // Private mode: at worst the coin strikes once more.
  }
}

export interface WalletCoinCardProps {
  cafe: WalletCafeDTO;
  /** For the coin's initials triad ("M" over "K · İ"); from the café list. */
  city?: string | null;
  onGift: (cafeSlug: string) => void;
}

interface Run {
  id: number;
  from: number;
  to: number;
  landed: boolean;
}

export function WalletCoinCard({ cafe, city, onGift }: WalletCoinCardProps) {
  const titleId = useId();
  const balance = Math.max(0, Math.floor(cafe.balancePeni));
  const coinCafe = { name: cafe.cafeName, district: cafe.district, city, slug: cafe.cafeSlug };
  const goods = goodsLine(balance, cafe.refItems);

  /* ---------- A6: strike once per rise over the last seen balance ---------- */
  const from = useLastSeenBalance(cafe.cafeSlug, balance);
  const [run, setRun] = useState<Run | null>(null);
  const [seenFrom, setSeenFrom] = useState<number | null>(null);
  if (from !== seenFrom) {
    setSeenFrom(from);
    if (from != null && from < balance) setRun({ id: (run?.id ?? 0) + 1, from, to: balance, landed: false });
  }
  const landed = useCallback(() => setRun((r) => (r && !r.landed ? { ...r, landed: true } : r)), []);
  const active = run && run.to === balance ? run : null;
  const shown = active && !active.landed ? active.from : balance;

  return (
    // Four rows (head, balance, notes, actions) on the JETON KESESİ grid's subgrid: side by side,
    // the balances, the notes and the buttons line up even when one café name wraps. The grid
    // has no row gap (it would open inside the card); `mb-4` spaces the cards instead.
    <article
      aria-labelledby={titleId}
      className="row-span-4 mb-4 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-[14px] bg-surface text-ink shadow-raised"
    >
      <div>
        <CafeHueBand slug={cafe.cafeSlug} hue={cafe.hue} size={6} />
        <div className="flex items-center gap-3.5 px-4 pt-4 md:px-5 md:pt-5">
          <Coin key={run?.id ?? 0} size={56} cafe={coinCafe} animate={active ? "strike" : null} onLand={landed} />
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-h3 text-ink">
              {cafe.cafeName}
            </h3>
            {cafe.district && <p className="mt-1 legend text-ink-2">{cafe.district}</p>}
          </div>
        </div>
      </div>

      <p className="flex items-baseline gap-1.5 px-4 pt-5 text-peni-ink md:px-5">
        <span className="font-display text-balance lining-nums tabular-nums">
          <NumberRoll key={run?.id ?? 0} value={shown} kind="peni" trend={active ? 1 : undefined} />
        </span>
        <span className="text-body">peni</span>
      </p>

      <div className="flex flex-col gap-0.5 px-4 pt-2 text-meta text-ink-2 md:px-5">
        {goods && (
          <p>
            <Approx />
            {`\u00A0${goods.split(SEP).join("\u00A0· ")}`}
          </p>
        )}
        <p>{peniCopy.walletRule}</p>
      </div>

      <div className="px-4 pt-4 pb-4 md:px-5 md:pb-5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-line pt-4">
          <Button
            variant="secondary"
            size="sm"
            iconStart={Gift}
            disabled={balance < 1}
            disabledReason={balance < 1 ? `Bakiyen ${formatNumber(balance)}` : undefined}
            onClick={() => onGift(cafe.cafeSlug)}
            aria-label={`${cafe.cafeName} için ısmarla`}
          >
            {actionCopy.gift}
          </Button>
          <Button variant="quiet" size="sm" href={`/k/${cafe.cafeSlug}`}>
            Kafeye git
          </Button>
        </div>
      </div>
    </article>
  );
}

/** The card's final geometry, for the loading state (the same four subgrid rows). */
export function WalletCoinCardSkeleton() {
  return (
    <div aria-hidden className="row-span-4 mb-4 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-[14px] bg-surface shadow-raised">
      <div>
        <Skeleton radius={0} className="h-1.5 w-full" />
        <div className="flex items-center gap-3.5 px-4 pt-4 md:px-5 md:pt-5">
          <Skeleton radius="full" className="size-14" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div className="px-4 pt-5 md:px-5">
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="flex flex-col gap-1.5 px-4 pt-2.5 md:px-5">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-3.5 w-52" />
      </div>
      <div className="px-4 pt-4 pb-4 md:px-5 md:pb-5">
        <div className="flex gap-2 border-t border-line pt-4">
          <Skeleton radius={10} className="h-11 w-28" />
          <Skeleton radius={10} className="h-11 w-24" />
        </div>
      </div>
    </div>
  );
}
