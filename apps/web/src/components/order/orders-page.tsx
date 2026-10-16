"use client";

import { PeniApiError, type OrderDTO } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { ReceiptText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveOrder } from "@/components/chrome/active-order";
import { Banner, Button, cx, EmptyState, Skeleton } from "@/components/ui";
import { peni } from "@/lib/client";
import { CompactFis } from "./compact-fis";
import { OrderHistory, OrderHistorySkeleton } from "./order-history";
import { ordersCopy } from "./copy";
import { byNewest, isActive, ORDERS_POLL_MS } from "./order-model";

export type OrdersInitial =
  | { kind: "ok"; orders: OrderDTO[] }
  | { kind: "signed_out" }
  /** The server couldn't read them; the client fetches (and shows the skeleton meanwhile). */
  | { kind: "client" };

type LoadState = "ok" | "loading" | "signed_out" | "error";

function messageOf(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

const withoutRetry = (message: string) => message.replace(/\s*Tekrar dene\.$/, "");

/**
 * Siparişlerim `/siparisler` (design-system.md §9.5): ŞİMDİ (active orders as compact fişes)
 * and GEÇMİŞ (one card of rows grouped by day). Read on the server for the first paint; while
 * an order is active and the tab is visible it re-reads every 10s, and also whenever the
 * header chip's poll sees a change. A failed refresh keeps the list and says so inline.
 */
export function OrdersPage({ initial }: { initial: OrdersInitial }) {
  const [orders, setOrders] = useState<OrderDTO[] | null>(initial.kind === "ok" ? initial.orders : null);
  const [load, setLoad] = useState<LoadState>(initial.kind === "ok" ? "ok" : initial.kind === "signed_out" ? "signed_out" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const fetchOrders = useCallback(async () => {
    try {
      const { orders: mine } = await peni.orders.mine();
      setOrders(mine);
      setLoad("ok");
      setError(null);
      setNow(new Date());
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) {
        setLoad("signed_out");
        return;
      }
      setError(messageOf(e));
      setLoad((s) => (s === "loading" ? "error" : s));
    }
  }, []);

  // No server data: read now.
  useEffect(() => {
    if (initial.kind === "client") void fetchOrders();
  }, []);

  const active = useMemo(() => (orders ?? []).filter((o) => isActive(o.status)).sort(byNewest), [orders]);
  const past = useMemo(() => (orders ?? []).filter((o) => !isActive(o.status)), [orders]);

  /* ------------------------------------------------------------------------- freshness */

  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVisibility = () => {
      const v = document.visibilityState === "visible";
      setVisible(v);
      if (v && load === "ok") void fetchOrders();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load, fetchOrders]);

  const hasActive = active.length > 0;
  useEffect(() => {
    if (!visible || !hasActive || load !== "ok") return;
    const t = window.setInterval(() => void fetchOrders(), ORDERS_POLL_MS);
    return () => window.clearInterval(t);
  }, [visible, hasActive, load, fetchOrders]);

  // The header chip polls too; when it sees an order move, follow it at once.
  const { orders: chipOrders } = useActiveOrder();
  const chipSig = chipOrders.map((o) => `${o.id}:${o.status}`).join(",");
  const lastSig = useRef(chipSig);
  useEffect(() => {
    if (chipSig === lastSig.current) return;
    lastSig.current = chipSig;
    if (load === "ok") void fetchOrders();
  }, [chipSig, load, fetchOrders]);

  /* ---------------------------------------------------------------------------- render */

  if (load === "signed_out") {
    return (
      <Page>
        <EmptyState icon={ReceiptText} text={ordersCopy.signedOut} action={{ label: actionCopy.signIn, href: "/giris?returnTo=%2Fsiparisler" }} />
      </Page>
    );
  }

  const retry = (
    <Button
      size="sm"
      variant="secondary"
      loading={retrying}
      loadingLabel={errorCopy.retry}
      onClick={async () => {
        setRetrying(true);
        await fetchOrders();
        setRetrying(false);
      }}
    >
      {errorCopy.retry}
    </Button>
  );

  if (!orders) {
    return (
      <Page>
        {load === "error" && error ? (
          <Banner tone="danger" title={withoutRetry(error)} action={retry} />
        ) : (
          <div aria-busy="true" aria-label={ordersCopy.loading} className="flex flex-col">
            <Skeleton className="mb-3 h-4 w-16" />
            <OrderHistorySkeleton />
          </div>
        )}
      </Page>
    );
  }

  if (orders.length === 0) {
    return (
      <Page>
        {error && <Banner tone="danger" title={withoutRetry(error)} action={retry} className="mb-4" />}
        <EmptyState icon={ReceiptText} text={ordersCopy.empty} action={{ label: actionCopy.browseCafes, href: "/" }} />
      </Page>
    );
  }

  // From 1024px an active order gets its own column beside the history.
  const split = active.length > 0 && past.length > 0;
  return (
    <Page wide={split}>
      {error && <Banner tone="danger" title={withoutRetry(error)} action={retry} className="mb-6" />}
      <div className={cx("flex flex-col gap-8 md:gap-12", split && "lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-12")}>
        {active.length > 0 && (
          <section aria-labelledby="simdi">
            <h2 id="simdi" className="mb-3 legend text-ink-2">
              {ordersCopy.legendNow}
            </h2>
            <ul className="flex flex-col gap-5">
              {active.map((o) => (
                <li key={o.id}>
                  <CompactFis order={o} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {past.length > 0 && (
          <section aria-labelledby="gecmis">
            <h2 id="gecmis" className="mb-3 legend text-ink-2">
              {ordersCopy.legendPast}
            </h2>
            <OrderHistory orders={past} now={now} />
          </section>
        )}
      </div>
    </Page>
  );
}

/** The page column (reading width, §5) under the h2 "Siparişlerim"; two columns from 1024px when `wide`. */
function Page({ wide = false, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cx("mx-auto w-full max-w-[640px]", wide && "lg:max-w-[1088px]")}>
      <h1 className="mb-6 font-display text-h2 md:mb-8">{ordersCopy.title}</h1>
      {children}
    </div>
  );
}
