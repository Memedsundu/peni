"use client";

import { newIdempotencyKey, PeniApiError, type CafeDetailDTO, type MenuItemDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CafeCover, Masthead } from "@/components/brand";
import { useActiveOrder } from "@/components/chrome/active-order";
import { useChromeSession } from "@/components/chrome/session";
import { cx } from "@/components/ui";
import { peni } from "@/lib/client";
import { AskiPanel } from "./aski-panel";
import { CafeContext, type CafeCtx } from "./cafe-context";
import { CafeMeta, memberGreeting, MembershipRow } from "./cafe-hero";
import { CafeLoadError, CafeNotFound, CafeSkeleton } from "./cafe-states";
import { CartBar, CartPanel, CartSheet } from "./cart-bar";
import { cartTotals, EMPTY_CART, orderInput, parseSepet, useCafeCart, type CartState } from "./cart";
import { JoinSheet, type JoinRequest } from "./join-sheet";
import { MasaFeed } from "./masa-feed";
import { MenuSection } from "./menu-section";
import { SectionNav, useScrollSpy, type CafeSectionId } from "./section-nav";
import { TodayStrip } from "./today-strip";

/** Query parameters the page acts on once, then removes from the address bar. */
export interface CafeEntryParams {
  /** `?sepet=latte:1,simit:1` from "Her zamanki" / "Yeniden sipariş ver". */
  sepet?: string | null;
  /** `?ekle=latte`: back from /giris after a non-member "+"; finish the add. */
  ekle?: string | null;
  /** `?katil=1`: back from /giris after "Giriş yap ve katıl"; finish the join. */
  katil?: string | null;
}

export type CafeInitial =
  | { kind: "ok"; cafe: CafeDetailDTO }
  | { kind: "not_found" }
  | { kind: "error"; message: string }
  /** The server couldn't read it; the client fetches (and shows the skeleton meanwhile). */
  | { kind: "client" };

/** Order errors whose fix is to drop the ikram line and keep everything else (§9.3, G3). */
const ASKI_ERRORS = new Set(["ASKIDA_EMPTY", "ASKIDA_LIMIT", "ASKIDA_TOO_NEW", "ASKIDA_DISABLED", "PRODUCT_NOT_ELIGIBLE"]);
/** Errors with no message worth showing: say the cart is safe instead. */
const GENERIC_ERRORS = new Set(["NETWORK", "INTERNAL", "VALIDATION"]);

/** What an order error was raised for: the lines, the ikram and the peni choice (not the note). */
const cartSig = (st: CartState) => JSON.stringify([st.lines, st.ikram, st.usePeni]);

function loadMessage(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

/**
 * The café page `/k/[slug]` (design-system.md §9.3): the shell, the menu and the cart. The
 * Askı module and the Masa feed are their own components and read everything they need from
 * `useCafe()`.
 */
export function CafePage({ slug, initial, entry }: { slug: string; initial: CafeInitial; entry: CafeEntryParams }) {
  const router = useRouter();
  const session = useChromeSession();
  const signedIn = session !== null;
  const firstName = session?.name.trim().split(/\s+/)[0] || null;
  const { refresh: refreshOrders } = useActiveOrder();

  const [cafe, setCafe] = useState<CafeDetailDTO | null>(initial.kind === "ok" ? initial.cafe : null);
  const [loadState, setLoadState] = useState<"ok" | "loading" | "not_found" | "error">(
    initial.kind === "ok" ? "ok" : initial.kind === "client" ? "loading" : initial.kind === "not_found" ? "not_found" : "error",
  );
  const [loadError, setLoadError] = useState<string | null>(initial.kind === "error" ? initial.message : null);
  const [retrying, setRetrying] = useState(false);
  const [now] = useState(() => new Date());
  const lastFetch = useRef(Date.now());

  /* ------------------------------------------------------------------ loading and refresh */

  const fetchCafe = useCallback(async () => {
    const fresh = await peni.cafes.get(slug);
    lastFetch.current = Date.now();
    setCafe(fresh);
    setLoadState("ok");
    setLoadError(null);
    return fresh;
  }, [slug]);

  const firstLoad = useCallback(async () => {
    setRetrying(true);
    try {
      await fetchCafe();
    } catch (e) {
      if (e instanceof PeniApiError && (e.status === 404 || e.code === "NOT_FOUND")) setLoadState("not_found");
      else {
        setLoadState("error");
        setLoadError(loadMessage(e));
      }
    } finally {
      setRetrying(false);
    }
  }, [fetchCafe]);

  useEffect(() => {
    if (initial.kind === "client") void firstLoad();
  }, [initial.kind, firstLoad]);

  /** After the first load, a failed refresh keeps what is on screen (never wipes the page). */
  const refresh = useCallback(async () => {
    try {
      await fetchCafe();
    } catch {
      // Stale but whole beats empty; the next action or visit tries again.
    }
  }, [fetchCafe]);

  // Back to the tab after a while: quietly re-read (askı count, posts, balance).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > 30_000) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  /* ------------------------------------------------------------------------------- cart */

  const cart = useCafeCart(slug);
  const member = !!cafe?.membership;
  const orderingBlocked: CafeCtx["orderingBlocked"] = !cafe
    ? null
    : !cafe.acceptingOrders
      ? "closed"
      : cafe.membership && !cafe.membership.preorderEnabled
        ? "preorder_off"
        : null;
  // A cart only exists for members: a stored cart from before a sign-out stays out of sight.
  const totals = useMemo(
    () => (cafe ? cartTotals(cafe, cafe.membership ? cart.state : EMPTY_CART) : null),
    [cafe, cart.state],
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dropped, setDropped] = useState<string[]>([]);

  /* ------------------------------------------------------------------------------- join */

  const [join, setJoin] = useState<{ open: boolean; request: JoinRequest }>({
    open: false,
    request: { primary: "Kafeye katıl", returnTo: `/k/${slug}` },
  });
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const afterJoin = useRef<(() => void) | null>(null);

  const doJoin = useCallback(async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const fresh = await peni.cafes.join(slug);
      lastFetch.current = Date.now();
      setCafe(fresh);
      setJoin((j) => ({ ...j, open: false }));
      // The chrome learns about the new membership (Peni kodum appears).
      router.refresh();
      const then = afterJoin.current;
      afterJoin.current = null;
      then?.();
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) {
        router.push(`/giris?returnTo=${encodeURIComponent(join.request.returnTo)}`);
        return;
      }
      setJoinError(loadMessage(e));
    } finally {
      setJoining(false);
    }
  }, [slug, router, join.request.returnTo]);

  const openJoin = useCallback((request: JoinRequest, then?: () => void) => {
    afterJoin.current = then ?? null;
    setJoinError(null);
    setJoin({ open: true, request });
  }, []);

  const requireJoin = useCallback(
    (then?: () => void) => {
      if (!signedIn) {
        router.push(`/giris?returnTo=${encodeURIComponent(`/k/${slug}`)}`);
        return;
      }
      if (member) {
        then?.();
        return;
      }
      openJoin({ primary: then ? "Katıl ve devam et" : "Kafeye katıl", returnTo: `/k/${slug}` }, then);
    },
    [signedIn, member, slug, router, openJoin],
  );

  const joinAndAdd = useCallback(
    (item: MenuItemDTO) =>
      openJoin({ primary: "Katıl ve ekle", returnTo: `/k/${slug}?ekle=${encodeURIComponent(item.productId)}` }, () =>
        cart.add(item.productId),
      ),
    [openJoin, slug, cart],
  );

  /* ---------------------------------------------------------------- entry params, once */

  const entryHandled = useRef(false);
  useEffect(() => {
    if (entryHandled.current || !cart.restored || !cafe) return;
    entryHandled.current = true;
    const { sepet, ekle, katil } = entry;
    if (!sepet && !ekle && !katil) return;

    const byId = new Map(cafe.menu.map((m) => [m.productId, m]));
    if (sepet && cafe.membership && !orderingBlocked) {
      const wanted = parseSepet(sepet);
      const ok = wanted.filter(([id]) => byId.get(id)?.available);
      const gone = wanted.map(([id]) => byId.get(id)).filter((m): m is MenuItemDTO => !!m && !m.available);
      if (ok.length) cart.replaceLines(ok);
      setDropped(gone.map((m) => m.name));
    }
    const item = ekle ? byId.get(ekle) : undefined;
    if (item?.available && !orderingBlocked && signedIn) {
      if (cafe.membership) cart.add(item.productId);
      else joinAndAdd(item);
    }
    if (katil && signedIn && !cafe.membership) void doJoin();

    // Through the router, not history.replaceState: Next's router state and cache must forget the
    // parameters too, or Back (from the fiş) and router.refresh() bring them back and re-apply
    // them: a cart for an order already sent, or a second latte.
    router.replace(`/k/${slug}${window.location.hash}`, { scroll: false });
    // Runs once, when the cart and the café are both in hand.
  }, [cart.restored, cafe]);

  /* ------------------------------------------------------------------------------ order */

  const [busy, setBusy] = useState(false);
  // The error belongs to the cart it was raised for: once the cart changes, it no longer shows.
  const [orderFailure, setOrderFailure] = useState<{ message: string; cart: string } | null>(null);
  const orderError = orderFailure && orderFailure.cart === cartSig(cart.state) ? orderFailure.message : null;
  // One key per checkout attempt, so a double tap can't create two orders; a new one after an error.
  const orderKey = useRef(newIdempotencyKey());

  const submit = useCallback(async () => {
    if (!cafe || !totals || busy || totals.count === 0) return;
    setBusy(true);
    setOrderFailure(null);
    try {
      const order = await peni.orders.create(orderInput(slug, cart.state, totals, orderKey.current));
      cart.forget();
      void refreshOrders();
      // D15: no toast. The fiş says "Kafeye iletildi".
      router.push(`/siparis/${order.id}`);
    } catch (e) {
      orderKey.current = newIdempotencyKey();
      setBusy(false);
      if (e instanceof PeniApiError && e.status === 401) {
        router.push(`/giris?returnTo=${encodeURIComponent(`/k/${slug}`)}`);
        return;
      }
      const code = e instanceof PeniApiError ? e.code : "INTERNAL";
      // An askı refusal takes the ikram line out and keeps everything else (§9.3, G3).
      const dropIkram = ASKI_ERRORS.has(code);
      if (dropIkram) cart.setIkram(null);
      setOrderFailure({
        message: GENERIC_ERRORS.has(code) || code.startsWith("HTTP_") ? errorCopy.orderSend : loadMessage(e),
        cart: cartSig(dropIkram ? { ...cart.state, ikram: null } : cart.state),
      });
      void refresh();
    }
  }, [cafe, totals, busy, slug, cart, refreshOrders, router, refresh]);

  /* -------------------------------------------------------------------------- sections */

  const sectionIds = useMemo<CafeSectionId[]>(
    () => (cafe?.askida.enabled === false ? ["menu", "masa"] : ["menu", "aski", "masa"]),
    [cafe?.askida.enabled],
  );
  const spy = useScrollSpy(cafe ? sectionIds : []);
  const goToPost = useCallback(
    (postId: string) => {
      const target = document.getElementById(`post-${postId}`) ?? document.querySelector<HTMLElement>(`[data-post-id="${postId}"]`);
      spy.go("masa", { target });
    },
    [spy],
  );

  const ctx = useMemo<CafeCtx | null>(
    () =>
      cafe
        ? {
            cafe,
            signedIn,
            member,
            refresh,
            requireJoin,
            addIkram: (productId: string) => cart.setIkram(productId),
            ikramProductId: totals?.ikramItem?.productId ?? null,
            orderingBlocked,
          }
        : null,
    [cafe, signedIn, member, refresh, requireJoin, cart, totals?.ikramItem?.productId, orderingBlocked],
  );

  /* ---------------------------------------------------------------------------- render */

  if (loadState === "not_found") return <CafeNotFound />;
  if (!cafe || !ctx || !totals) {
    if (loadState === "error") return <CafeLoadError slug={slug} message={loadError ?? errorCopy.generic} retrying={retrying} onRetry={firstLoad} />;
    return <CafeSkeleton slug={slug} />;
  }

  const cartView = { cafe, cart, totals, blocked: orderingBlocked, busy, error: orderError, onSubmit: submit };
  const sectionClass = "scroll-mt-[calc(var(--header-h)+var(--seg-h)+8px)] outline-none";

  return (
    <CafeContext.Provider value={ctx}>
      <div className="flex flex-col">
        <CafeCover cafe={cafe} size="hero" priority />
        <Masthead cafe={cafe} date={now} greeting={memberGreeting(member, firstName, now)} className="mt-5 md:mt-6" />

        <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="flex min-w-0 flex-col">
            <CafeMeta cafe={cafe} />
            <div className="mt-4">
              <MembershipRow cafe={cafe} signedIn={signedIn} joining={joining && !join.open} joinError={join.open ? null : joinError} onJoin={() => void doJoin()} />
            </div>
            <div className={cx("mt-6 empty:hidden")}>
              <TodayStrip cafe={cafe} now={now} onGo={goToPost} />
            </div>

            {/* A direct child of the column, so it stays stuck through all three sections. */}
            <SectionNav ids={sectionIds} active={spy.active} onGo={(id) => spy.go(id)} className="mt-6" />

            <section id="menu" tabIndex={-1} aria-labelledby="menu-baslik" className={cx(sectionClass, "pt-6")}>
              <h2 id="menu-baslik" className="sr-only">
                Menü
              </h2>
              <MenuSection
                menu={cafe.menu}
                lines={cart.state.lines}
                ikram={cart.state.ikram}
                member={member}
                blocked={orderingBlocked}
                dropped={dropped}
                locked={busy}
                onChange={cart.setQty}
                onJoinAdd={joinAndAdd}
              />
            </section>

            {sectionIds.includes("aski") && (
              <section id="aski" tabIndex={-1} aria-label="Askı" className={cx(sectionClass, "mt-8 md:mt-12")}>
                <AskiPanel />
              </section>
            )}

            <section id="masa" tabIndex={-1} aria-label="Masa" className={cx(sectionClass, "mt-8 md:mt-12")}>
              <MasaFeed />
            </section>

            {/* Tablets have no bottom nav to stand in for: keep the last lines clear of the cart bar. */}
            {totals.count > 0 && <div aria-hidden className="hidden h-[var(--cartbar-h)] md:block lg:hidden" />}
          </div>

          <aside aria-label="Sepet" className="hidden lg:block">
            {/* The side padding keeps the fiş shadow clear of the scroll box's clip. */}
            <div className="sticky top-[calc(64px+24px)] -mx-3 max-h-[calc(100dvh-112px)] overflow-y-auto overscroll-contain px-3 pb-6 [scrollbar-width:thin]">
              <CartPanel {...cartView} />
            </div>
          </aside>
        </div>
      </div>

      <CartBar totals={totals} open={sheetOpen} onOpen={() => setSheetOpen(true)} />
      <CartSheet open={sheetOpen} onOpenChange={setSheetOpen} {...cartView} />
      <JoinSheet
        open={join.open}
        onOpenChange={(open) => {
          setJoin((j) => ({ ...j, open }));
          // A failed join in the sheet stays with the sheet: it never surfaces under the row.
          if (!open) setJoinError(null);
        }}
        cafe={cafe}
        signedIn={signedIn}
        request={join.request}
        busy={joining}
        error={joinError}
        onJoin={() => void doJoin()}
      />
    </CafeContext.Provider>
  );
}
