/**
 * The customer's orders for Siparişler (§9.5, §10.4).
 *
 * - Reads on focus and on demand (pull to refresh, "Tekrar dene").
 * - While an order is active and the tab is in focus and the app is active, re-reads every 10s;
 *   it also follows the active-order store at once (the tab layout polls it, the fiş feeds it),
 *   so ŞİMDİ never lags behind the pill.
 * - A failed refresh keeps the list (the screen says so on top); a 401 is the signed-out state.
 */
import { PeniApiError, type OrderDTO, type PeniClient } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useActiveOrder } from "@/lib/active-order";
import { isActive, ORDERS_POLL_MS } from "./model";

export type OrdersLoad = "loading" | "ok" | "error" | "signed_out";

export interface UseOrders {
  orders: OrderDTO[] | null;
  load: OrdersLoad;
  /** The last failure, kept while the list stays on screen. */
  error: string | null;
  /** When the list was read ("Bugün" / "Dün" are counted from here). */
  readAt: Date;
  refresh: () => Promise<void>;
}

function messageOf(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

export function useOrders(api: PeniClient, signedIn: boolean): UseOrders {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);
  const [load, setLoad] = useState<OrdersLoad>(signedIn ? "loading" : "signed_out");
  const [error, setError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState(() => new Date());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Signing in or out starts over.
  useEffect(() => {
    setOrders(null);
    setError(null);
    setLoad(signedIn ? "loading" : "signed_out");
  }, [signedIn]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try {
      const { orders: mine } = await api.orders.mine();
      if (!alive.current) return;
      setOrders(mine);
      setError(null);
      setReadAt(new Date());
      setLoad("ok");
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof PeniApiError && e.status === 401) {
        setLoad("signed_out");
        return;
      }
      setError(messageOf(e));
      setLoad((s) => (s === "loading" || s === "error" ? "error" : s));
    }
  }, [api, signedIn]);

  // On focus; and every 10s while an order is active, the tab is focused and the app is active.
  const hasActive = (orders ?? []).some((o) => isActive(o.status));
  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (!hasActive) return;
      let appActive = AppState.currentState === "active" || AppState.currentState == null;
      const timer = setInterval(() => {
        if (appActive) void refresh();
      }, ORDERS_POLL_MS);
      const sub = AppState.addEventListener("change", (s) => {
        const now = s === "active";
        if (now && !appActive) void refresh();
        appActive = now;
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [refresh, hasActive]),
  );

  // Follow the active-order store when it sees an order move.
  const active = useActiveOrder();
  const sig = active ? `${active.id}:${active.status}` : "";
  const lastSig = useRef(sig);
  useEffect(() => {
    if (sig === lastSig.current) return;
    lastSig.current = sig;
    if (load === "ok") void refresh();
  }, [sig, load, refresh]);

  return { orders, load, error, readAt, refresh };
}
