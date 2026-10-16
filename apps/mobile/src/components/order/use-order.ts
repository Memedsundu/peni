/**
 * The order the fiş shows, shared by `siparis/[id]` and the `iptal` sheet (§10.3).
 *
 * One module-level cache keyed by order id: the screen polls into it, the sheet writes the
 * cancelled order into it, so the fiş turns "İptal edildi." the moment the sheet closes,
 * with no extra request and no toast (§17: no toast duplicates what the screen shows).
 *
 * Polling (§10.3): every 4s while the screen is focused (`useFocusEffect`) AND the app is
 * active (`AppState`); a chain of timeouts, never an interval, so a slow response never
 * stacks a second request. It stops for good at `collected | rejected | cancelled | no_show`.
 * Returning to the screen (a sheet closing, the app coming back) reads at once.
 */
import { PeniApiError, type OrderDTO } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { noteOrder } from "@/lib/active-order";
import { useSession } from "@/lib/session";
import { isTerminal, ORDER_POLL_MS } from "./order-model";

/* ------------------------------------------------------------------------------------------ */
/* Cache                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const cache = new Map<string, OrderDTO>();
const listeners = new Set<() => void>();

/** Stores a fresh copy of an order (from a poll, a cancel, a send) and tells every reader. */
export function putOrder(order: OrderDTO): void {
  const known = cache.get(order.id);
  if (known && sameOrder(known, order)) return;
  cache.set(order.id, order);
  listeners.forEach((l) => l());
  // The tab badge and the active-order pill learn about it now, not on their next 20s read.
  noteOrder(order);
}

/** The last known copy of an order, without a request. */
export function getCachedOrder(id: string | null | undefined): OrderDTO | null {
  return id ? (cache.get(id) ?? null) : null;
}

function sameOrder(a: OrderDTO, b: OrderDTO): boolean {
  return (
    a.status === b.status &&
    a.orderNumber === b.orderNumber &&
    a.acceptedAt === b.acceptedAt &&
    a.readyAt === b.readyAt &&
    a.closedAt === b.closedAt &&
    a.earnedPeni === b.earnedPeni &&
    a.dueKurus === b.dueKurus &&
    a.rejectionReason === b.rejectionReason &&
    a.memberCode === b.memberCode
  );
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Re-renders when the cached copy of this order changes. */
export function useCachedOrder(id: string | null | undefined): OrderDTO | null {
  const read = () => getCachedOrder(id);
  return useSyncExternalStore(subscribe, read, read);
}

/* ------------------------------------------------------------------------------------------ */
/* Loading and polling                                                                         */
/* ------------------------------------------------------------------------------------------ */

export type OrderLoad = "loading" | "ok" | "not_found" | "signed_out" | "error";

/** The message for a failed read; the network case gets the house sentence. */
export function errorMessage(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

/** Drops the "Tekrar dene." the button beside it already says. */
export function withoutRetry(message: string): string {
  return message.replace(/\s*Tekrar dene\.$/, "");
}

export interface UseOrder {
  order: OrderDTO | null;
  load: OrderLoad;
  /** The last failed read's message (kept while the fiş stays on screen). */
  error: string | null;
  /** Failed reads in a row; the screen speaks up from `POLL_FAILURES_SHOWN`. */
  failures: number;
  /** Reads now (pull to refresh, "Tekrar dene"). Resolves when the read is done. */
  refresh: () => Promise<void>;
}

function useAppActive(): boolean {
  const [state, setState] = useState<AppStateStatus>(() => (AppState.currentState as AppStateStatus | null) ?? "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", setState);
    return () => sub.remove();
  }, []);
  // `unknown` (iOS at launch) counts as active: the screen is being looked at.
  return state !== "background" && state !== "inactive";
}

export function useOrder(id: string | null | undefined): UseOrder {
  const { api, signedIn } = useSession();
  const order = useCachedOrder(id);
  const [load, setLoad] = useState<OrderLoad>(order ? "ok" : "loading");
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const read = useCallback(async () => {
    if (!id) {
      setLoad("not_found");
      return;
    }
    // One read at a time: a pull-to-refresh during a poll joins it.
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        putOrder(await api.orders.get(id));
        setLoad("ok");
        setError(null);
        setFailures(0);
      } catch (e) {
        if (e instanceof PeniApiError && e.status === 404) setLoad("not_found");
        else if (e instanceof PeniApiError && e.status === 401) setLoad("signed_out");
        else {
          setError(errorMessage(e));
          setFailures((n) => n + 1);
          // A failed poll never wipes the fiş: only a first read with nothing to show is an error.
          setLoad((s) => (s === "ok" && getCachedOrder(id) ? "ok" : "error"));
        }
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [api, id]);

  // Signing in from the "giriş yap" state comes back here: read again.
  useEffect(() => {
    if (signedIn) setLoad((s) => (s === "signed_out" ? "loading" : s));
  }, [signedIn]);

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const appActive = useAppActive();

  const terminal = order ? isTerminal(order.status) : false;
  const stopped = load === "not_found" || load === "signed_out";
  const polling = focused && appActive && !terminal && !stopped;

  const readOnce = useRef(false);
  useEffect(() => {
    if (!polling) return;
    readOnce.current = true;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await read();
      if (alive) timer = setTimeout(tick, ORDER_POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [polling, read]);

  // A terminal order opened from the cache is still read once (it may have earned its peni since).
  useEffect(() => {
    if (readOnce.current || polling || stopped || !focused) return;
    readOnce.current = true;
    void read();
  }, [polling, stopped, focused, read]);

  return { order, load: order && load !== "not_found" && load !== "signed_out" ? "ok" : load, error, failures, refresh: read };
}
