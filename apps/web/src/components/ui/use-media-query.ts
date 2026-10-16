"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `matchMedia` as a hook. The server (and the hydration pass) see `serverValue`; the client
 * re-renders with the real answer right after, and on every change.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** ≥768px: the `md` breakpoint, where sheets become dialogs and the top nav replaces the bottom nav. */
export const MD_UP = "(min-width: 768px)";
