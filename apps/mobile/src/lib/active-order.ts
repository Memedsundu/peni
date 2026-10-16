/**
 * The customer's newest active order (submitted | accepted | ready), for the Siparişler tab
 * badge, the iOS 26 bottom accessory and the floating pill (§8.4 "Active order").
 *
 * One module-level store, so the root-stack screens (café, order fiş, iptal sheet) can update
 * it, while the polling itself runs once, from the customer tab layout:
 * - on mount, on sign-in, and when the app returns to the foreground;
 * - every 20s while an order is active (and the app is active); never while there is none.
 * The order fiş polls every 4s on its own and hands every fresh copy here (`noteOrder`), so
 * the badge and the pill are never behind the fiş.
 */
import type { OrderDTO, PeniClient } from "@peni/api";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

const ACTIVE: ReadonlySet<OrderDTO["status"]> = new Set(["submitted", "accepted", "ready"]);
const POLL_MS = 20_000;

let current: OrderDTO | null = null;
let fetcher: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function set(next: OrderDTO | null) {
  const same =
    next === current ||
    (next &&
      current &&
      next.id === current.id &&
      next.status === current.status &&
      next.orderNumber === current.orderNumber);
  if (same) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The newest active order, or null. */
export function useActiveOrder(): OrderDTO | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

/** Re-reads the orders now (after sending, cancelling, or when an order screen closes). */
export function refreshActiveOrder(): Promise<void> {
  return fetcher ? fetcher() : Promise.resolve();
}

/**
 * A fresh copy of one order, from a screen that just read or changed it (the fiş poll, the
 * iptal sheet, the café after sending). The store follows at once:
 * - the order is active and at least as new as the one shown: it becomes the one shown;
 * - the order shown has just ended: the store re-reads, because another order may be active.
 */
export function noteOrder(order: OrderDTO): void {
  const active = ACTIVE.has(order.status);
  if (current && current.id === order.id) {
    if (active) set(order);
    else {
      set(null);
      void refreshActiveOrder();
    }
    return;
  }
  if (active && (!current || order.submittedAt >= current.submittedAt)) set(order);
}

export function pickActiveOrder(orders: readonly OrderDTO[]): OrderDTO | null {
  let best: OrderDTO | null = null;
  for (const o of orders) {
    if (!ACTIVE.has(o.status)) continue;
    if (!best || o.submittedAt > best.submittedAt) best = o;
  }
  return best;
}

/** Mount once (customer tab layout). */
export function useActiveOrderPolling(api: PeniClient, signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) {
      fetcher = null;
      set(null);
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let appActive = AppState.currentState === "active" || AppState.currentState == null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (alive && appActive && current) timer = setTimeout(() => void load(), POLL_MS);
    };
    const load = async () => {
      try {
        const { orders } = await api.orders.mine();
        if (alive) set(pickActiveOrder(orders));
      } catch {
        // Keep the last known state; the next foreground or refresh tries again.
      }
      schedule();
    };

    fetcher = load;
    void load();
    const sub = AppState.addEventListener("change", (s) => {
      const nowActive = s === "active";
      if (nowActive && !appActive) {
        appActive = true;
        void load();
      } else if (!nowActive) {
        appActive = false;
        schedule();
      }
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
      if (fetcher === load) fetcher = null;
    };
  }, [api, signedIn]);
}

/* ------------------------------------------------------------------------------------------ */
/* Where the indicator lives (§8.4)                                                            */
/* ------------------------------------------------------------------------------------------ */

/**
 * iOS 26 and later: `NativeTabs.BottomAccessory`, which the system lays out (and insets the
 * tab content for). Everywhere else (Android, iOS < 26, the browser preview): the floating
 * `ActiveOrderPill` 8pt above the tab bar, on tab screens only.
 */
export function usesBottomAccessory(): boolean {
  if (Platform.OS !== "ios") return false;
  const major = Number.parseInt(String(Platform.Version), 10);
  return Number.isFinite(major) && major >= 26;
}

/** The floating pill's height (48) plus its 8pt gap to the tab bar and 8pt of air above it. */
export const ACTIVE_ORDER_PILL_SPACE = 64;

/**
 * Extra bottom padding a tab screen's ScrollView adds while the floating pill is up, so its last
 * row can scroll clear of it: `contentContainerStyle={{ paddingBottom: base + inset }}`.
 * Zero when there is no active order, and on iOS 26 (the system insets for the accessory).
 */
export function useActiveOrderInset(): number {
  const active = useActiveOrder();
  return active && !usesBottomAccessory() ? ACTIVE_ORDER_PILL_SPACE : 0;
}
