"use client";

import type { WalletCafeDTO } from "@peni/api";
import { actionCopy, peniCopy } from "@peni/brand/copy";
import { formatNumber, formatPeni, goodsLine, SEP } from "@peni/brand/format";
import { Gift } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Approx, CafeHueBand, Coin } from "@/components/brand";
import { Button, NumberRoll, Skeleton } from "@/components/ui";
import { readSeen, writeSeen } from "./seen-balance";

/*
 * One coin card in JETON KESESİ (design-system.md §9.6, §6.6, A6): a raised card with the café
 * colourway band on top, the café's 56px coin, its name and district, the balance in
 * `text-balance` ("90" + " peni"), the goods line [G1], "1 peni = ₺1, yalnız bu kafe için.",
 * then "Ismarla" (secondary) and "Kafeye git" (quiet).
 *
 * A6 coin-strike, when the balance is higher than the one this device last showed
 * (`seen-balance.ts`). The server reads that value, so its paint is already the strike's first
 * frame: the OLD number, and the coin not dropped in yet. After hydration the coin drops in on
 * `spring.strike`; the number holds the old value until it lands, then rolls up. The new
 * number is never painted first, so it never rolls backwards. Reduced motion: the coin fades in
 * over 150ms and the number swaps.
 *
 * A change the page made itself (a gift accepted or taken back here) is marked seen first
 * (`markBalanceSeen`), so the number just rolls: that moment already had its own motion.
 */

/** Record a balance as already seen, so the next render rolls to it without a strike. */
export function markBalanceSeen(cafeSlug: string, balance: number): void {
  writeSeen(cafeSlug, balance);
}

export interface WalletCoinCardProps {
  cafe: WalletCafeDTO;
  /** For the coin's initials triad ("M" over "K · İ"); from the café list. */
  city?: string | null;
  /** The balance this device last showed, as the server read it (`peni_seen`): drives A6. */
  seen?: number | null;
  onGift: (cafeSlug: string) => void;
}

interface Run {
  id: number;
  from: number;
  to: number;
  landed: boolean;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const subscribeNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function WalletCoinCard({ cafe, city, seen, onGift }: WalletCoinCardProps) {
  const titleId = useId();
  const slug = cafe.cafeSlug;
  const balance = Math.max(0, Math.floor(cafe.balancePeni));
  const coinCafe = { name: cafe.cafeName, district: cafe.district, city, slug };
  const goods = goodsLine(balance, cafe.refItems);

  /* ---------- A6 ---------- */
  // The first frame is the server's: a strike when the balance it read for this device was lower.
  const [run, setRun] = useState<Run | null>(() =>
    seen != null && seen < balance ? { id: 1, from: seen, to: balance, landed: false } : null,
  );

  // A later rise that the page did not mark as its own strikes from the number on screen.
  const [prev, setPrev] = useState(balance);
  if (balance !== prev) {
    setPrev(balance);
    const stored = readSeen(slug);
    if (balance > prev && !(stored != null && stored >= balance)) {
      setRun({ id: (run?.id ?? 0) + 1, from: prev, to: balance, landed: false });
    }
  }

  // Hydrating server HTML, the server's frame stands (it is already on screen). A render that
  // starts on the client (a soft navigation, a page from the router cache) has painted nothing
  // yet, and this device's storage is fresher than what the server read: settle on it.
  const clientRender = useSyncExternalStore(subscribeNothing, onClient, onServer);
  const startedOnClient = useRef(clientRender);
  const [mounted, setMounted] = useState(false);
  const checked = useRef(false);
  useIsoLayoutEffect(() => {
    // Once per card (StrictMode re-runs effects; by then the balance is already stored as seen).
    if (checked.current) return;
    checked.current = true;
    if (startedOnClient.current) {
      const stored = readSeen(slug);
      const wanted = stored != null && stored < balance;
      if (!wanted && run) setRun(null);
      else if (wanted && run?.from !== stored) setRun({ id: (run?.id ?? 0) + 1, from: stored, to: balance, landed: false });
    }
    setMounted(true);
    // Mount only: later changes are handled during render above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What is on screen counts as seen, so a reload in the middle of a strike doesn't strike again.
  useEffect(() => writeSeen(slug, balance), [slug, balance]);

  const landed = useCallback(() => setRun((r) => (r && !r.landed ? { ...r, landed: true } : r)), []);
  const active = run && run.to === balance ? run : null;
  const holding = active !== null && !active.landed;
  const shown = holding ? active.from : balance;

  return (
    // Four rows (head, balance, notes, actions) on the JETON KESESİ grid's subgrid: side by side,
    // the balances, the notes and the buttons line up even when one café name wraps. The grid
    // has no row gap (it would open inside the card); `mb-4` spaces the cards instead.
    <article
      aria-labelledby={titleId}
      className="row-span-4 mb-4 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-[14px] bg-surface text-ink shadow-raised"
    >
      <div>
        <CafeHueBand slug={slug} hue={cafe.hue} size={6} />
        <div className="flex items-center gap-3.5 px-4 pt-4 md:px-5 md:pt-5">
          {holding && !mounted ? (
            // The server's frame of the strike (and the hydration pass): the coin has not dropped
            // in yet. A6 starts from opacity 0, so the hand-over after hydration is seamless.
            <Coin size={56} cafe={coinCafe} className="opacity-0" />
          ) : (
            <Coin key={run?.id ?? 0} size={56} cafe={coinCafe} animate={active ? "strike" : null} onLand={landed} />
          )}
          <div className="min-w-0">
            <h3 id={titleId} className="font-display text-h3 text-ink">
              {cafe.cafeName}
            </h3>
            {cafe.district && <p className="mt-1 legend text-ink-2">{cafe.district}</p>}
          </div>
        </div>
      </div>

      <p className="px-4 pt-5 text-peni-ink md:px-5">
        {/* Read once, as "270 peni". The rolling figure stays out of the accessibility tree here:
            NumberFlow's own `aria-hidden` reaches its custom element as an empty attribute, which
            does not hide it, so the balance would be read twice (see SHARED CHANGES). */}
        <span aria-hidden="true" className="flex items-baseline gap-1.5">
          <span className="font-display text-balance lining-nums tabular-nums">
            {/* Keyed by the strike: a new strike starts at its old value instead of rolling to it. */}
            <NumberRoll key={run?.id ?? 0} value={shown} kind="peni" trend={active ? 1 : undefined} />
          </span>
          <span className="text-body">peni</span>
        </span>
        <span className="sr-only">{formatPeni(balance)}</span>
      </p>

      <div className="flex flex-col gap-0.5 px-4 pt-2 text-meta text-ink-2 md:px-5">
        {goods && (
          <p>
            <Approx />
            {` ${goods.split(SEP).join(" · ")}`}
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
            onClick={() => onGift(slug)}
            aria-label={`${cafe.cafeName} için ısmarla`}
          >
            {actionCopy.gift}
          </Button>
          <Button variant="quiet" size="sm" href={`/k/${slug}`} aria-label={`${cafe.cafeName}: kafeye git`}>
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
