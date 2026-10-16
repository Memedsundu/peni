"use client";

import { PeniApiError, type OrderDTO } from "@peni/api";
import { actionCopy, errorCopy, orderCopy } from "@peni/brand/copy";
import { ReceiptText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveOrder } from "@/components/chrome/active-order";
import { Banner, Button, cx, EmptyState } from "@/components/ui";
import { peni } from "@/lib/client";
import { CancelSheet } from "./cancel-sheet";
import { orderPageCopy } from "./copy";
import type { EarnShow } from "./earn-moment";
import { OrderFis, OrderFisSkeleton } from "./order-fis";
import { documentTitle, earnAlreadySeen, earnMode, hasEarn, isTerminal, markEarnSeen, ORDER_POLL_MS, reorderHref } from "./order-model";

export type OrderInitial =
  | { kind: "ok"; order: OrderDTO }
  | { kind: "not_found" }
  | { kind: "signed_out" }
  /** The server couldn't read it; the client fetches (and shows the skeleton meanwhile). */
  | { kind: "client" };

type LoadState = "ok" | "loading" | "not_found" | "signed_out" | "error";

function messageOf(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

/** Drops the "Tekrar dene." the button already says. */
const withoutRetry = (message: string) => message.replace(/\s*Tekrar dene\.$/, "");

/**
 * `/siparis/[id]` (design-system.md §9.4). The order is read on the server for the first paint;
 * from then on the page polls every 4s while the tab is visible, and stops for good once the
 * order is collected, rejected, cancelled or not collected. A failed poll never wipes the fiş.
 */
export function OrderPage({ id, initial }: { id: string; initial: OrderInitial }) {
  const { refresh: refreshActive } = useActiveOrder();
  const [order, setOrder] = useState<OrderDTO | null>(initial.kind === "ok" ? initial.order : null);
  const [load, setLoad] = useState<LoadState>(initial.kind === "client" ? "loading" : initial.kind);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollFailed, setPollFailed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [now] = useState(() => new Date());

  // What changed while the customer was looking (drives the stamp and the coin, A6/A11).
  const [liveReady, setLiveReady] = useState(false);
  const lastStatus = useRef(order?.status ?? null);

  /*
   * The earn moment (A6) is decided before it first paints, never after: a server-rendered
   * collected fiş holds its place ("pending") until the browser has read whether this order's
   * peni was already seen, and an order that turns collected while watching gets "strike" in
   * the same render that shows it collected. So the coin never appears, vanishes and drops in.
   */
  const [earnShow, setEarnShow] = useState<EarnShow>(() => (hasEarn(order) ? "pending" : "static"));
  const earnDecided = useRef(false);
  const decideEarn = useCallback((previous: OrderDTO["status"] | null, next: OrderDTO) => {
    if (earnDecided.current || !hasEarn(next)) return;
    earnDecided.current = true;
    setEarnShow(earnMode(previous, earnAlreadySeen(next.id)));
    markEarnSeen(next.id);
  }, []);
  useEffect(() => {
    // The server's collected fiş: first view or a revisit.
    if (order) decideEarn(null, order);
    // Only on mount; later changes come through `apply`.
  }, []);

  const apply = useCallback(
    (next: OrderDTO) => {
      const prev = lastStatus.current;
      lastStatus.current = next.status;
      setOrder(next);
      setLoad("ok");
      setPollFailed(0);
      decideEarn(prev, next);
      if (prev !== null && prev !== next.status) {
        if (next.status === "ready") setLiveReady(true);
        // The chip and the Siparişler dot learn about it now, not in 20s.
        void refreshActive();
      }
    },
    [refreshActive, decideEarn],
  );

  const fetchOrder = useCallback(async () => {
    try {
      apply(await peni.orders.get(id));
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 404) {
        setLoad("not_found");
      } else if (e instanceof PeniApiError && e.status === 401) {
        setLoad("signed_out");
      } else {
        setLoadError(messageOf(e));
        setPollFailed((n) => n + 1);
        setLoad((s) => (s === "loading" || s === "error" ? "error" : s));
      }
    }
  }, [id, apply]);

  /* ------------------------------------------------------------------ polling (§9.4) */

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const status = order?.status ?? null;
  const polling = visible && (load === "ok" || load === "loading" || load === "error") && !(status && isTerminal(status));

  // The server's read is fresh on the first paint: the first poll waits its 4s.
  const serverFresh = useRef(initial.kind === "ok");
  useEffect(() => {
    if (!polling) return;
    let alive = true;
    let timer: number | undefined;
    // A chain of timeouts, not an interval: a slow response never stacks a second request.
    const tick = async () => {
      await fetchOrder();
      if (alive) timer = window.setTimeout(tick, ORDER_POLL_MS);
    };
    // Coming back to the tab (or a first paint with no server data) reads at once.
    if (serverFresh.current) timer = window.setTimeout(tick, ORDER_POLL_MS);
    else void tick();
    serverFresh.current = false;
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // Restart only when polling switches on or off.
  }, [polling]);

  /* --------------------------------------------------------------- title and earn moment */

  useEffect(() => {
    if (order) document.title = documentTitle(order);
  }, [order?.status, order?.orderNumber]);

  /* ------------------------------------------------------------------------ cancel (D16) */

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // After a cancel, "İptal et" under the fiş is gone: focus goes to the fiş's heading instead.
  const heading = useRef<HTMLHeadingElement>(null);
  const [cancelDone, setCancelDone] = useState(false);

  const confirmCancel = useCallback(async () => {
    if (cancelBusy) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      apply(await peni.orders.cancel(id));
      setCancelDone(true);
      setCancelOpen(false);
      void refreshActive();
    } catch (e) {
      setCancelError(messageOf(e));
      // The barista may have just accepted it: read the order, and the sheet says so.
      void fetchOrder();
    } finally {
      setCancelBusy(false);
    }
  }, [cancelBusy, id, apply, fetchOrder, refreshActive]);

  /* ---------------------------------------------------------------------------- states */

  if (load === "not_found") {
    return (
      <Column centered>
        <EmptyState icon={ReceiptText} text={orderCopy.notFound} action={{ label: orderCopy.notFoundAction, href: "/siparisler" }} />
      </Column>
    );
  }

  if (load === "signed_out") {
    return (
      <Column centered>
        <EmptyState
          icon={ReceiptText}
          text={orderPageCopy.signedOut}
          action={{ label: actionCopy.signIn, href: `/giris?returnTo=${encodeURIComponent(`/siparis/${id}`)}` }}
        />
      </Column>
    );
  }

  if (!order) {
    // The first read failed: say so, alone. A skeleton here would claim it is still loading.
    // (A retry that is itself in flight shows on the button, and the poll keeps trying.)
    if (load === "error" && loadError) {
      return (
        <Column centered>
          <Banner
            tone="danger"
            title={withoutRetry(loadError)}
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={retrying}
                loadingLabel={errorCopy.retry}
                onClick={async () => {
                  setRetrying(true);
                  await fetchOrder();
                  setRetrying(false);
                }}
              >
                {errorCopy.retry}
              </Button>
            }
          />
        </Column>
      );
    }
    return (
      <Column>
        <OrderFisSkeleton />
      </Column>
    );
  }

  const rejected = order.status === "rejected";
  const cafeHref = `/k/${encodeURIComponent(order.cafeSlug)}`;

  return (
    <Column>
      {/* Two missed polls in a row: say so, keep the fiş as it was. */}
      {pollFailed >= 2 && loadError && (
        <Banner
          tone="danger"
          title={withoutRetry(loadError)}
          className="mb-4"
          action={
            <Button size="sm" variant="secondary" onClick={() => void fetchOrder()}>
              {errorCopy.retry}
            </Button>
          }
        />
      )}

      <OrderFis order={order} now={now} stampAnimates={liveReady} earnShow={earnShow} headingRef={heading} />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        {rejected ? (
          <>
            <Button variant="primary" href={reorderHref(order)} fullWidth className="sm:flex-1">
              {orderCopy.reorder}
            </Button>
            <Button variant="secondary" href={cafeHref} fullWidth className="sm:flex-1">
              {orderCopy.backToCafe}
            </Button>
          </>
        ) : (
          <Button variant="primary" href={cafeHref} fullWidth className="sm:flex-1">
            {orderCopy.backToCafe}
          </Button>
        )}
        {order.status === "submitted" && (
          <Button
            variant="danger-quiet"
            className="self-center sm:self-auto"
            onClick={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
          >
            {orderCopy.cancel}
          </Button>
        )}
      </div>

      <CancelSheet
        order={order}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        busy={cancelBusy}
        error={cancelError}
        tooLate={order.status !== "submitted" && order.status !== "cancelled"}
        onConfirm={() => void confirmCancel()}
        finalFocus={cancelDone ? heading : true}
        onClosed={() => {
          // Belt and braces: if focus still fell to the page, put it on the heading.
          if (cancelDone && (document.activeElement === document.body || document.activeElement == null)) heading.current?.focus();
        }}
      />
    </Column>
  );
}

/** Centred, max 440px (§9.4). `centered` also centres a lone message vertically. */
function Column({ centered = false, children }: { centered?: boolean; children: React.ReactNode }) {
  return <div className={cx("mx-auto w-full max-w-[440px]", centered && "flex min-h-[50dvh] flex-col justify-center")}>{children}</div>;
}
