"use client";

import { PeniApiError, type CafeSummaryDTO, type FullWalletDTO, type GiftDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { QrCode, Store } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signInHref } from "@/components/auth/return-to";
import { Coin } from "@/components/brand";
import { usePeniKodu } from "@/components/chrome/peni-kodu";
import { Banner, Button, EmptyState, Skeleton, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { GiftInvite } from "./gift-invite";
import { GiftSheet } from "./gift-sheet";
import { HistoryList, HistoryListSkeleton } from "./history-list";
import { primePeniKodu } from "./peni-kodu-dialog";
import { markBalanceSeen, WalletCoinCard, WalletCoinCardSkeleton } from "./wallet-coin-card";
import { buildHistory } from "./wallet-model";

/*
 * Cüzdan `/cuzdan` (design-system.md §9.6, D19).
 *
 *   Cüzdan                                   [Peni kodum]
 *   2 kafede peni biriktirdin.
 *   ┌ incoming gifts (gift fişes) ┐
 *   JETON KESESİ   one raised coin card per membership
 *   HAREKETLER     the history, by day, as sentences
 *
 * From 1024px the history moves to a right column. The first paint comes from the server
 * (no loading flash); actions reload the wallet in place and never wipe the page. Signed out,
 * empty, loading and error each have their own state. `?ismarla=moda` opens the gift sheet on
 * that café; `#peni-kodum` opens the Peni kodum dialog.
 */

export type WalletInitial =
  | { kind: "ok"; wallet: FullWalletDTO; cafes: CafeSummaryDTO[] }
  | { kind: "signed_out" }
  /** The server could not read it: the client loads it. */
  | { kind: "client" };

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "signed_out" }
  | { kind: "ok"; wallet: FullWalletDTO };

export function WalletPage({ initial, ismarla }: { initial: WalletInitial; ismarla: string | null }) {
  const kodu = usePeniKodu();
  const [state, setState] = useState<State>(
    initial.kind === "ok" ? { kind: "ok", wallet: initial.wallet } : initial.kind === "signed_out" ? { kind: "signed_out" } : { kind: "loading" },
  );
  const [cities, setCities] = useState<Record<string, string | null>>(() =>
    initial.kind === "ok" ? Object.fromEntries(initial.cafes.map((c) => [c.slug, c.city])) : {},
  );
  /** Gifts accepted on this screen keep their fiş (now "Afiyet olsun!") until the page is left. */
  const [acceptedHere, setAcceptedHere] = useState<GiftDTO[]>([]);
  const [sheet, setSheet] = useState<{ open: boolean; slug: string | null }>({ open: ismarla !== null, slug: ismarla || null });

  const wallet = state.kind === "ok" ? state.wallet : null;

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

  const onDeclined = useCallback(() => void load("refresh"), [load]);

  const onCancelGift = useCallback(
    async (giftId: string) => {
      try {
        await peni.gifts.cancel(giftId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : errorCopy.generic);
        return;
      }
      const gift = wallet?.gifts.find((g) => g.id === giftId);
      const before = gift ? wallet?.cafes.find((c) => c.cafeSlug === gift.cafeSlug)?.balancePeni : undefined;
      if (gift && before != null) markBalanceSeen(gift.cafeSlug, before + gift.peni);
      await load("refresh");
    },
    [wallet, load],
  );

  const openGift = useCallback((slug: string | null) => setSheet({ open: true, slug }), []);

  /* ---------- derived ---------- */
  const incoming = useMemo(() => {
    if (!wallet) return [];
    const pending = wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending");
    const ids = new Set(pending.map((g) => g.id));
    // Newest first, and an accepted fiş keeps its place (nothing jumps when one is accepted).
    return [...acceptedHere.filter((g) => !ids.has(g.id)).map((g) => ({ gift: g, accepted: true })), ...pending.map((g) => ({ gift: g, accepted: false }))].sort(
      (a, b) => b.gift.createdAt.localeCompare(a.gift.createdAt),
    );
  }, [wallet, acceptedHere]);
  const lines = useMemo(() => (wallet ? buildHistory(wallet) : []), [wallet]);

  /* ---------- render ---------- */
  if (state.kind === "signed_out") {
    return (
      <div className="mx-auto flex w-full max-w-[400px] flex-col items-center pt-6 text-center md:pt-12">
        <Coin size={96} />
        <h1 className="mt-6 font-display text-h2 text-ink">Cüzdan</h1>
        <p className="mt-2 text-body-lg text-ink-2">Cüzdanını görmek için giriş yap.</p>
        <Button href={signInHref("/cuzdan")} fullWidth className="mt-6">
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
            <Button size="sm" variant="secondary" onClick={() => {
                setState({ kind: "loading" });
                void load("first");
              }}>
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

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <PageHeader
        meta={peniCopy.walletSummary(w.cafes.length)}
        action={
          kodu.available ? (
            <Button variant="secondary" size="sm" iconStart={QrCode} onClick={() => kodu.show()}>
              {peniCopy.peniCode}
            </Button>
          ) : null
        }
      />

      <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-8 md:gap-10">
          {incoming.length > 0 && (
            <section aria-label="Sana ısmarlananlar" className="flex flex-col gap-4">
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
            </section>
          )}

          <section aria-labelledby="jeton-kesesi">
            <h2 id="jeton-kesesi" className="mb-3 legend text-ink-2">
              {peniCopy.coinPurse}
            </h2>
            <div className={w.cafes.length > 1 ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:max-w-[420px]"}>
              {w.cafes.map((c) => (
                <WalletCoinCard key={c.membershipId} cafe={c} city={cities[c.cafeSlug] ?? null} onGift={openGift} />
              ))}
            </div>
          </section>
        </div>

        <section aria-labelledby="hareketler" className="min-w-0">
          <h2 id="hareketler" className="mb-3 legend text-ink-2">
            {peniCopy.movements}
          </h2>
          <HistoryList items={lines} showCafe={w.cafes.length > 1} onCancelGift={onCancelGift} />
        </section>
      </div>

      <GiftSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        wallet={w}
        cities={cities}
        cafeSlug={sheet.slug}
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

function WalletSkeleton() {
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
      <div className="grid gap-8 md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
        <div aria-hidden>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="grid gap-4 sm:grid-cols-2">
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
