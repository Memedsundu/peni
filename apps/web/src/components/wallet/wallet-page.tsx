"use client";

import { PeniApiError, type CafeSummaryDTO, type FullWalletDTO, type GiftDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { dativeName, formatPeni } from "@peni/brand/format";
import { QrCode, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { signInHref } from "@/components/auth/return-to";
import { Coin } from "@/components/brand";
import { usePeniKodu } from "@/components/chrome/peni-kodu";
import { Banner, Button, EmptyState, Skeleton, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { focusTargetClass, GiftInvite } from "./gift-invite";
import { GiftSheet } from "./gift-sheet";
import { HistoryList, HistoryListSkeleton } from "./history-list";
import { primePeniKodu } from "./peni-kodu-dialog";
import { markBalanceSeen, WalletCoinCard, WalletCoinCardSkeleton } from "./wallet-coin-card";
import { buildHistory, firstName } from "./wallet-model";

/*
 * Cüzdan `/cuzdan` (design-system.md §9.6, D19).
 *
 *   Cüzdan                                   [Peni kodum]
 *   2 kafede peni biriktirdin.
 *   ┌ incoming gifts (gift fişes) ┐
 *   JETON KESESİ   one raised coin card per membership
 *   HAREKETLER     the history, by day, as sentences
 *
 * Phones read top to bottom in that order. From 768px two or more fişes sit two by two. From
 * 1024px the coin purse holds the left column and the fişes head the right one, above the
 * history: however many gifts are waiting, the purse is never pushed below the fold, and an
 * accepted gift's coin flip and the card's balance roll are seen together.
 *
 * The first paint comes from the server (no loading flash); actions reload the wallet in place
 * and never wipe the page. Signed out, empty, loading and error each have their own state.
 * `?ismarla=moda` opens the gift sheet on that café; `#peni-kodum` opens the Peni kodum dialog.
 * Focus never falls to the page when something leaves (a declined fiş, a "Geri al"), and each
 * such change is read out once through the page's status line.
 */

export type WalletInitial =
  | {
      kind: "ok";
      wallet: FullWalletDTO;
      cafes: CafeSummaryDTO[];
      /** Balances this device last showed, per café (the `peni_seen` cookie): A6's first frame. */
      seen?: Readonly<Record<string, number>>;
    }
  | { kind: "signed_out" }
  /** The server could not read it: the client loads it. */
  | { kind: "client" };

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "signed_out" }
  | { kind: "ok"; wallet: FullWalletDTO };

const NO_SEEN: Readonly<Record<string, number>> = {};

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash;
const noHash = () => "";

export function WalletPage({ initial, ismarla }: { initial: WalletInitial; ismarla: string | null }) {
  const kodu = usePeniKodu();
  const [state, setState] = useState<State>(
    initial.kind === "ok" ? { kind: "ok", wallet: initial.wallet } : initial.kind === "signed_out" ? { kind: "signed_out" } : { kind: "loading" },
  );
  const [cities, setCities] = useState<Record<string, string | null>>(() =>
    initial.kind === "ok" ? Object.fromEntries(initial.cafes.map((c) => [c.slug, c.city])) : {},
  );
  const seen = initial.kind === "ok" ? (initial.seen ?? NO_SEEN) : NO_SEEN;
  /** Gifts accepted on this screen keep their fiş (now "Afiyet olsun!") until the page is left. */
  const [acceptedHere, setAcceptedHere] = useState<GiftDTO[]>([]);
  /** Gifts declined on this screen leave at once, before the reload confirms it. */
  const [declinedHere, setDeclinedHere] = useState<readonly string[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; slug: string | null; fromUrl: boolean }>({
    open: ismarla !== null,
    slug: ismarla || null,
    fromUrl: ismarla !== null,
  });
  const hash = useSyncExternalStore(subscribeHash, readHash, noHash);

  const wallet = state.kind === "ok" ? state.wallet : null;

  /* ---------- the status line (one polite region for the whole page) ---------- */
  const [announcement, setAnnouncement] = useState("");
  const sayTimer = useRef<number | undefined>(undefined);
  const say = useCallback((text: string) => {
    // Cleared first, so the same words twice in a row are still read twice.
    setAnnouncement("");
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setAnnouncement(text), 60);
  }, []);
  useEffect(() => () => window.clearTimeout(sayTimer.current), []);

  /* ---------- loading ---------- */
  const load = useCallback(async (mode: "first" | "refresh") => {
    try {
      const w = await peni.wallet.get();
      setState({ kind: "ok", wallet: w });
      return w;
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) setState({ kind: "signed_out" });
      else if (mode === "first") setState({ kind: "error", message: e instanceof Error ? e.message : errorCopy.generic });
      else toast.error(e instanceof Error ? e.message : errorCopy.generic);
      return null;
    }
  }, []);

  useEffect(() => {
    if (initial.kind === "client") void load("first");
  }, [initial.kind, load]);

  // City for the coin triad ("M" over "K · İ") lives on the café list.
  useEffect(() => {
    if (initial.kind === "ok" || state.kind !== "ok") return;
    let live = true;
    peni.cafes
      .list()
      .then(({ cafes }) => live && setCities(Object.fromEntries(cafes.map((c) => [c.slug, c.city]))))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initial.kind, state.kind]);

  // The dialog opens with no wait: hand it the codes we already have.
  useEffect(() => {
    if (wallet) primePeniKodu(wallet.cafes);
  }, [wallet]);

  // `/cuzdan#peni-kodum` (PENI_KODU_FALLBACK_HREF).
  const hashDone = useRef(false);
  useEffect(() => {
    if (hashDone.current || !wallet || wallet.cafes.length === 0) return;
    hashDone.current = true;
    if (window.location.hash === "#peni-kodum") {
      kodu.show();
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [wallet, kodu]);

  /* ---------- derived ---------- */
  const incoming = useMemo(() => {
    if (!wallet) return [];
    const pending = wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending" && !declinedHere.includes(g.id));
    const ids = new Set(pending.map((g) => g.id));
    // Newest first, and an accepted fiş keeps its place (nothing jumps when one is accepted).
    return [...acceptedHere.filter((g) => !ids.has(g.id)).map((g) => ({ gift: g, accepted: true })), ...pending.map((g) => ({ gift: g, accepted: false }))].sort(
      (a, b) => b.gift.createdAt.localeCompare(a.gift.createdAt),
    );
  }, [wallet, acceptedHere, declinedHere]);
  const lines = useMemo(() => (wallet ? buildHistory(wallet) : []), [wallet]);

  /* ---------- focus targets ---------- */
  const giftsRef = useRef<HTMLDivElement>(null);
  const purseTitleRef = useRef<HTMLHeadingElement>(null);
  /** Where the declined fiş stood: the fiş that takes its place gets the focus. */
  const refocusAt = useRef<number | null>(null);
  useEffect(() => {
    const at = refocusAt.current;
    if (at === null) return;
    refocusAt.current = null;
    const titles = giftsRef.current?.querySelectorAll<HTMLElement>("[data-gift-title]");
    const next = titles && titles.length > 0 ? titles[Math.min(at, titles.length - 1)] : purseTitleRef.current;
    next?.focus();
  }, [incoming]);

  /* ---------- actions ---------- */
  const onAccepted = useCallback(
    (gift: GiftDTO) => {
      setAcceptedHere((list) => (list.some((g) => g.id === gift.id) ? list : [...list, gift]));
      const before = wallet?.cafes.find((c) => c.cafeSlug === gift.cafeSlug)?.balancePeni;
      // The fiş's coin flip is this moment; the card's number just rolls (no second coin).
      if (before != null) markBalanceSeen(gift.cafeSlug, before + gift.peni);
      void load("refresh");
    },
    [wallet, load],
  );

  const onDeclined = useCallback(
    (gift: GiftDTO) => {
      refocusAt.current = Math.max(0, incoming.findIndex((x) => x.gift.id === gift.id));
      setDeclinedHere((ids) => (ids.includes(gift.id) ? ids : [...ids, gift.id]));
      say(`Geri çevirdin. Peni ${dativeName(firstName(gift.fromName))} döndü.`);
      void load("refresh");
    },
    [incoming, load, say],
  );

  const onCancelGift = useCallback(
    async (giftId: string): Promise<boolean> => {
      try {
        await peni.gifts.cancel(giftId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : errorCopy.generic);
        return false;
      }
      const gift = wallet?.gifts.find((g) => g.id === giftId);
      const before = gift ? wallet?.cafes.find((c) => c.cafeSlug === gift.cafeSlug)?.balancePeni : undefined;
      // The peni coming home is not an earn moment: the card just rolls.
      if (gift && before != null) markBalanceSeen(gift.cafeSlug, before + gift.peni);
      await load("refresh");
      if (gift) say(`${formatPeni(gift.peni)} cüzdanına döndü.`);
      return true;
    },
    [wallet, load, say],
  );

  const openGift = useCallback((slug: string | null) => setSheet({ open: true, slug, fromUrl: false }), []);

  /* ---------- render ---------- */
  if (state.kind === "signed_out") {
    // After signing in, come back to what was asked for: the gift sheet, or the Peni kodu.
    const back = `/cuzdan${ismarla ? `?ismarla=${encodeURIComponent(ismarla)}` : ""}${hash === "#peni-kodum" ? hash : ""}`;
    return (
      <div className="mx-auto flex w-full max-w-[400px] flex-col items-center pt-6 text-center md:pt-12">
        <Coin size={96} />
        <h1 className="mt-6 font-display text-h2 text-ink">Cüzdan</h1>
        <p className="mt-2 text-body-lg text-ink-2">Cüzdanını görmek için giriş yap.</p>
        <Button href={signInHref(back)} fullWidth className="mt-6">
          {actionCopy.signIn}
        </Button>
      </div>
    );
  }

  if (state.kind === "loading") return <WalletSkeleton />;

  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <Banner
          tone="danger"
          title="Cüzdanın yüklenemedi."
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setState({ kind: "loading" });
                void load("first");
              }}
            >
              {errorCopy.retry}
            </Button>
          }
        >
          {state.message}
        </Banner>
      </div>
    );
  }

  const w = state.wallet;

  if (w.cafes.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader />
        <EmptyState
          icon={Store}
          text="Henüz peni yok. Bir kafeye katıl; ilk siparişinden itibaren her harcamada peni birikir."
          action={{ label: actionCopy.browseCafes, href: "/" }}
        />
      </div>
    );
  }

  const hasGifts = incoming.length > 0;
  // "2 kafede peni biriktirdin." counts only cafés where there is peni to speak of.
  const withPeni = w.cafes.filter((c) => c.balancePeni >= 1).length;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        meta={withPeni > 0 ? peniCopy.walletSummary(withPeni) : undefined}
        action={
          // Phones only: from 768px the top bar carries the same labelled "Peni kodum" right
          // above, and two of them a few pixels apart read as two different things.
          kodu.available ? (
            <Button variant="secondary" size="sm" iconStart={QrCode} onClick={() => kodu.show()} className="md:hidden">
              {peniCopy.peniCode}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-x-12">
        {hasGifts && (
          // From 1024px: 28px down (the "JETON KESESİ" legend's line), so the first fiş starts
          // level with the coin cards beside it.
          <section aria-labelledby="sana-ismarlananlar" className="min-w-0 lg:col-start-2 lg:row-start-1 lg:pt-7">
            <h2 id="sana-ismarlananlar" className="sr-only">
              Sana ısmarlananlar
            </h2>
            <div ref={giftsRef} className={incoming.length > 1 ? "grid gap-4 md:grid-cols-2 lg:grid-cols-1" : "grid gap-4"}>
              {incoming.map(({ gift, accepted }) => {
                const c = w.cafes.find((x) => x.cafeSlug === gift.cafeSlug);
                return (
                  <GiftInvite
                    key={gift.id}
                    gift={gift}
                    accepted={accepted}
                    cafe={{ name: gift.cafeName, district: c?.district, city: cities[gift.cafeSlug] ?? null, slug: gift.cafeSlug }}
                    refItems={c?.refItems ?? []}
                    onAccepted={onAccepted}
                    onDeclined={onDeclined}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* The cards sit two by two once the purse itself is 34rem wide (a container query, so
            the narrow left column at 1024px stacks them instead of squeezing them). From 1280px,
            with one row of cards, the purse stays in view while the right column scrolls: accept
            a gift further down and its café's balance still rolls in sight. */}
        <section
          aria-labelledby="jeton-kesesi"
          className={`@container min-w-0 lg:col-start-1 lg:row-start-1 lg:self-start ${hasGifts ? "lg:row-span-2" : ""} ${
            w.cafes.length <= 2 ? "xl:sticky xl:top-[calc(var(--header-h)+2rem)]" : ""
          }`}
        >
          <h2 id="jeton-kesesi" ref={purseTitleRef} tabIndex={-1} className={`mb-3 w-fit legend text-ink-2 ${focusTargetClass}`}>
            {peniCopy.coinPurse}
          </h2>
          <div className={w.cafes.length > 1 ? "-mb-4 grid gap-x-4 @[34rem]:grid-cols-2" : "-mb-4 grid @[34rem]:max-w-[420px]"}>
            {w.cafes.map((c) => (
              <WalletCoinCard
                key={c.membershipId}
                cafe={c}
                city={cities[c.cafeSlug] ?? null}
                seen={seen[c.cafeSlug] ?? null}
                onGift={openGift}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="hareketler" className={`min-w-0 lg:col-start-2 ${hasGifts ? "lg:row-start-2" : "lg:row-start-1"}`}>
          <h2 id="hareketler" className="mb-3 legend text-ink-2">
            {peniCopy.movements}
          </h2>
          <HistoryList items={lines} showCafe={w.cafes.length > 1} onCancelGift={onCancelGift} />
        </section>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <GiftSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        wallet={w}
        cities={cities}
        cafeSlug={sheet.slug}
        // Opened from a link (`?ismarla=`), nothing on this page opened it: land on the purse.
        finalFocus={sheet.fromUrl ? purseTitleRef : undefined}
        onSent={() => void load("refresh")}
        onClosed={() => {
          // Drop `?ismarla=` so a reload doesn't open the sheet again.
          if (new URLSearchParams(window.location.search).has("ismarla")) window.history.replaceState(null, "", window.location.pathname);
        }}
      />
    </div>
  );
}

function PageHeader({ meta, action }: { meta?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-h2 text-ink">Cüzdan</h1>
        {meta && <p className="mt-1 text-body text-ink-2">{meta}</p>}
      </div>
      {action}
    </header>
  );
}

/** The page's real geometry while the wallet loads (also the route's `loading.tsx`). */
export function WalletSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8 md:gap-10">
      <span className="sr-only">Cüzdan yükleniyor</span>
      <div aria-hidden className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton radius={10} className="h-11 w-36" />
      </div>
      <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-x-12">
        <div aria-hidden className="@container">
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="-mb-4 grid gap-x-4 @[34rem]:grid-cols-2">
            <WalletCoinCardSkeleton />
            <WalletCoinCardSkeleton />
          </div>
        </div>
        <div aria-hidden>
          <Skeleton className="mb-3 h-4 w-24" />
          <HistoryListSkeleton />
        </div>
      </div>
    </div>
  );
}
