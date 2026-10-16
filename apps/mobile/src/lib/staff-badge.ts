/**
 * The Tezgâh tab badge (§8.4): the number of new (submitted) orders. The Tezgâh screen, which
 * already polls the board, reports the count; the staff tab layout shows it.
 */
import { useSyncExternalStore } from "react";

let newOrders = 0;
const listeners = new Set<() => void>();

export function setNewOrderCount(n: number): void {
  const next = Math.max(0, Math.floor(n));
  if (next === newOrders) return;
  newOrders = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useNewOrderCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => newOrders,
    () => newOrders,
  );
}
