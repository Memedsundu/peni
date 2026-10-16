/**
 * App mode (design-system.md §8.4): "customer" or "staff", persisted under `peni.mode`.
 *
 * The value is read before the navigator mounts; the root layout keeps the splash up until
 * `ready`. Tabs are never hidden dynamically: the root Stack swaps whole groups with
 * `Stack.Protected guard={mode === …}`.
 *
 * - Profil → "Kafe moduna geç" (or the kafe-modu sheet): `setMode("staff")` → `/tezgah`.
 * - Ayarlar → "Müşteri moduna dön": `setMode("customer")` → `/`.
 */
import { router, type Href } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "./storage";

export type AppMode = "customer" | "staff";

export const MODE_KEY = "peni.mode";

/** Where each mode lands. */
export const MODE_HOME: Record<AppMode, Href> = { customer: "/", staff: "/tezgah" };

interface ModeContextValue {
  mode: AppMode;
  /** The persisted mode has been read. */
  ready: boolean;
  /**
   * Switches mode, remembers it, and (by default) replaces the current route with the mode's
   * home once the new group is mounted.
   */
  setMode: (next: AppMode, opts?: { navigate?: boolean }) => Promise<void>;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>("customer");
  const [ready, setReady] = useState(false);
  /** A navigation waiting for the next commit, so the guarded group is registered first. */
  const [pending, setPending] = useState<{ to: Href; n: number } | null>(null);

  useEffect(() => {
    let alive = true;
    storage
      .get(MODE_KEY)
      .then((v) => {
        if (alive && v === "staff") setModeState("staff");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Runs after the Stack below has re-rendered with the new guards (child effects run first),
  // so the target group is a known route by the time we navigate.
  useEffect(() => {
    if (!pending) return;
    router.replace(pending.to);
    setPending(null);
  }, [pending]);

  const setMode = useCallback(async (next: AppMode, opts?: { navigate?: boolean }) => {
    setModeState(next);
    if (opts?.navigate !== false) setPending((p) => ({ to: MODE_HOME[next], n: (p?.n ?? 0) + 1 }));
    try {
      await storage.set(MODE_KEY, next);
    } catch {
      // Not remembered across launches; the switch still applies now.
    }
  }, []);

  const value = useMemo(() => ({ mode, ready, setMode }), [mode, ready, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const v = useContext(ModeContext);
  if (!v) throw new Error("useMode outside ModeProvider");
  return v;
}
