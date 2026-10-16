"use client";

import { PeniApiError, type OrderDTO } from "@peni/api";
import { activeStatuses } from "@peni/brand/copy";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { peni } from "@/lib/client";

/**
 * The customer's in-flight orders (submitted | accepted | ready), for the header chip and the
 * Siparişler dot (design-system.md §8.2). Seeded on the server by (customer)/layout.tsx.
 *
 * Polling: every 20s while the document is visible AND an order is active; it stops on its
 * own when the last order closes. Each navigation and each return to the tab re-checks once,
 * so an order placed a moment ago shows up as soon as the customer leaves the fiş.
 */
export const ACTIVE_ORDER_POLL_MS = 20_000;

interface ActiveOrderContextValue {
  /** The newest active order, or null. */
  order: OrderDTO | null;
  /** Every active order, newest first. */
  orders: OrderDTO[];
  /** Re-check now (call after creating or cancelling an order). */
  refresh: () => Promise<void>;
}

const ActiveOrderContext = createContext<ActiveOrderContextValue>({
  order: null,
  orders: [],
  refresh: async () => {},
});

function activeOnly(orders: readonly OrderDTO[]): OrderDTO[] {
  return orders
    .filter((o) => (activeStatuses as readonly string[]).includes(o.status))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

function sameOrders(a: readonly OrderDTO[], b: readonly OrderDTO[]): boolean {
  return a.length === b.length && a.every((o, i) => o.id === b[i]!.id && o.status === b[i]!.status);
}

export function ActiveOrderProvider({
  signedIn,
  initialOrders,
  children,
}: {
  signedIn: boolean;
  initialOrders: readonly OrderDTO[];
  children: React.ReactNode;
}) {
  const [orders, setOrders] = useState<OrderDTO[]>(() => activeOnly(initialOrders));
  const [visible, setVisible] = useState(true);
  const pathname = usePathname();
  const inFlight = useRef<Promise<void> | null>(null);

  // A server re-render (router.refresh after sign-in/out) hands us fresh data.
  useEffect(() => {
    setOrders((prev) => {
      const next = activeOnly(initialOrders);
      return sameOrders(prev, next) ? prev : next;
    });
  }, [initialOrders]);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setOrders((prev) => (prev.length ? [] : prev));
      return;
    }
    // Coalesce overlapping calls (navigation + visibility + interval can coincide).
    inFlight.current ??= (async () => {
      try {
        const { orders: mine } = await peni.orders.mine();
        const next = activeOnly(mine);
        setOrders((prev) => (sameOrders(prev, next) ? prev : next));
      } catch (error) {
        // Signed out elsewhere: nothing is active. A network blip keeps the last known state.
        if (error instanceof PeniApiError && error.status === 401) setOrders([]);
      } finally {
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, [signedIn]);

  useEffect(() => {
    const onVisibility = () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible) void refresh();
    };
    setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  // Re-check on navigation (skipping the first render: the server data is fresh).
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    void refresh();
  }, [pathname, refresh]);

  const hasActive = orders.length > 0;
  useEffect(() => {
    if (!signedIn || !hasActive || !visible) return;
    const t = window.setInterval(() => void refresh(), ACTIVE_ORDER_POLL_MS);
    return () => window.clearInterval(t);
  }, [signedIn, hasActive, visible, refresh]);

  const value = useMemo(() => ({ order: orders[0] ?? null, orders, refresh }), [orders, refresh]);
  return <ActiveOrderContext.Provider value={value}>{children}</ActiveOrderContext.Provider>;
}

export function useActiveOrder(): ActiveOrderContextValue {
  return useContext(ActiveOrderContext);
}
