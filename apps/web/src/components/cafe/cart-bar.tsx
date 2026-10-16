"use client";

import { cartCopy } from "@peni/brand/copy";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, useAnimate, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef } from "react";
import { trUpper } from "@peni/brand/format";
import { Fis, type CoinCafe } from "@/components/brand";
import { useChromeLayer } from "@/components/chrome/layer";
import { cx, focusRing, MD_UP, NumberRoll, Sheet, tappable, useMediaQuery } from "@/components/ui";
import { ease, spring } from "@/lib/motion";
import type { CafeCart, CartTotals } from "./cart";
import { CartBody, CartFooter } from "./cart-content";

interface CartViewProps {
  cafe: CoinCafe;
  cart: CafeCart;
  totals: CartTotals;
  blocked: null | "closed" | "preorder_off";
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
}

/**
 * CartBar (design-system.md §9.3, §8.2, A4), phones and tablets (<1024): 64px + safe area,
 * `surface` with the floating shadow, one full-width button "2 ürün · ₺55 — Sepeti gör". On a
 * phone it takes the one floating layer from the bottom nav: the nav slides away, then the bar
 * slides up; when the cart empties the bar leaves first and the nav comes back after it.
 * Every add bumps the bar (1 → 1.03 → 1) and the total rolls. Reduced motion: a 150ms
 * crossfade, no bump.
 */
export function CartBar({
  totals,
  open,
  onOpen,
}: {
  totals: CartTotals;
  open: boolean;
  onOpen: () => void;
}) {
  const { setFloating } = useChromeLayer();
  const reduce = useReducedMotion();
  const phone = !useMediaQuery(MD_UP);
  const visible = totals.count > 0;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const lastCount = useRef(totals.count);

  // Claim the layer as soon as there is something in the cart. The nav gets it back from
  // `onExitComplete`, after the bar has left (and on unmount, from useChromeLayer itself).
  useEffect(() => {
    if (visible) setFloating("cartbar");
  }, [visible, setFloating]);

  useEffect(() => {
    const prev = lastCount.current;
    lastCount.current = totals.count;
    if (reduce || totals.count <= prev || prev === 0 || !scope.current) return;
    void (async () => {
      await animate(scope.current, { scale: 1.03 }, { duration: 0.08, ease: ease.outStrong });
      await animate(scope.current, { scale: 1 }, spring.snappy);
    })();
  }, [totals.count, reduce, animate, scope]);

  return (
    <AnimatePresence onExitComplete={() => setFloating("nav")}>
      {visible && (
        <m.div
          key="cartbar"
          className="fixed inset-x-0 bottom-0 z-40 bg-surface pb-[env(safe-area-inset-bottom)] shadow-floating lg:hidden"
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: "0%" }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={
            reduce
              ? { duration: 0.15 }
              : // On a phone the nav needs its 200ms to leave first.
                { duration: 0.25, ease: ease.drawer, delay: phone ? 0.12 : 0 }
          }
        >
          <div className="mx-auto flex h-16 max-w-[1120px] items-center px-4 sm:px-6">
            <div ref={scope} className="w-full">
              <button
                type="button"
                onClick={onOpen}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={cx(
                  "flex h-12 w-full items-center justify-between gap-3 rounded-[10px] bg-primary px-4 text-on-primary",
                  "transition-[background-color,scale] duration-150 ease-out-strong hover:bg-primary-pressed active:bg-primary-pressed motion-safe:active:scale-[.98] motion-reduce:transition-none",
                  tappable,
                  focusRing,
                )}
              >
                <span className="flex min-w-0 items-baseline gap-1.5 text-button whitespace-nowrap">
                  <span className="tabular-nums">{cartCopy.itemCount(totals.count)}</span>
                  <span aria-hidden>·</span>
                  {totals.dueKurus > 0 ? (
                    <span className="font-semibold tabular-nums">
                      <NumberRoll value={totals.dueKurus} kind="tl" />
                    </span>
                  ) : (
                    <span>Ödeme yok</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-button">
                  {cartCopy.open}
                  <ArrowRight aria-hidden size={20} strokeWidth={1.75} className="size-5" />
                </span>
              </button>
            </div>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** The cart sheet the bar opens: Base UI Drawer on phones, Dialog from 768px (D20, D24). */
export function CartSheet({ open, onOpenChange, ...view }: CartViewProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Emptied from inside the sheet: close it, the bar is leaving too.
  useEffect(() => {
    if (open && view.totals.count === 0) onOpenChange(false);
  }, [open, view.totals.count, onOpenChange]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={cartCopy.title}
      footer={<CartFooter totals={view.totals} blocked={view.blocked} busy={view.busy} error={view.error} onSubmit={view.onSubmit} />}
    >
      <CartBody cafe={view.cafe} cart={view.cart} totals={view.totals} editable />
    </Sheet>
  );
}

/**
 * CartPanel (≥1024): a sticky fiş beside the menu, legend "MODA KAHVESİ · SEPET", h3
 * "Siparişin". Empty: "Menüden bir şey seç. Ödemeyi kasada yaparsın."
 */
export function CartPanel(view: CartViewProps) {
  const empty = view.totals.count === 0;
  return (
    <Fis variant="order" legend={`${trUpper(view.cafe.name)} · SEPET`} bodyClassName="gap-0">
      <h3 className="mt-3 font-display text-h3 text-ink">{cartCopy.title}</h3>
      {empty ? (
        <p className="mt-2 text-meta text-ink-2">{cartCopy.empty}</p>
      ) : (
        <>
          <div className="mt-3">
            <CartBody cafe={view.cafe} cart={view.cart} totals={view.totals} editable={false} />
          </div>
          <hr className="my-4 border-0 border-t-[1.5px] border-dashed border-line-strong" />
          <CartFooter totals={view.totals} blocked={view.blocked} busy={view.busy} error={view.error} onSubmit={view.onSubmit} />
        </>
      )}
    </Fis>
  );
}
