"use client";

import { useEffect } from "react";

/*
 * Keeps the till screen awake during a shift (design-system.md §9.10): the Screen Wake Lock
 * API, requested by "Vardiyayı başlat" and re-acquired every time the tab becomes visible
 * again (the browser releases it whenever the page is hidden). Silent when unsupported.
 */

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}

let sentinel: Sentinel | null = null;
let pending: Promise<void> | null = null;

/** Ask for the lock now (call it from the shift-start tap as well: Safari wants a gesture). */
export function requestWakeLock(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return Promise.resolve();
  if (sentinel && !sentinel.released) return Promise.resolve();
  if (pending) return pending;
  const api = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } }).wakeLock;
  if (!api) return Promise.resolve();
  pending = api
    .request("screen")
    .then((s) => {
      sentinel = s;
      s.addEventListener("release", () => {
        if (sentinel === s) sentinel = null;
      });
    })
    .catch(() => {
      // Battery saver, an iframe without permission, or no gesture yet: the next visibility
      // change or tap tries again.
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

function releaseWakeLock() {
  const s = sentinel;
  sentinel = null;
  void s?.release().catch(() => {});
}

/** While `active`, hold the screen wake lock and take it back whenever the tab is shown again. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    void requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      releaseWakeLock();
    };
  }, [active]);
}
