"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PeniKoduDialog } from "@/components/wallet/peni-kodu-dialog";
import { useChromeSession } from "./session";

/**
 * "Peni kodum" (design-system.md §9.6): the top bar, Profil, Cüzdan and the café page all open
 * the same dialog. Triggers call `usePeniKodu().show(cafeSlug?)`. The provider (mounted once in
 * CustomerProviders) renders the one `PeniKoduDialog` itself, so every customer page has it.
 * Without a membership [G7b] there is no code, so every entry point is hidden.
 *
 * `/cuzdan#peni-kodum` also opens it (the Cüzdan page reads the hash): links from outside the
 * app, or from places that can't call the hook, use `PENI_KODU_FALLBACK_HREF`.
 */
export const PENI_KODU_FALLBACK_HREF = "/cuzdan#peni-kodum";

interface PeniKoduContextValue {
  open: boolean;
  cafeSlug: string | null;
  show: (cafeSlug?: string) => void;
  setOpen: (open: boolean) => void;
  register: () => () => void;
}

const PeniKoduContext = createContext<PeniKoduContextValue | null>(null);

export function PeniKoduProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cafeSlug, setCafeSlug] = useState<string | null>(null);
  const mounted = useRef(0);

  const show = useCallback((slug?: string) => {
    setCafeSlug(slug ?? null);
    setOpen(true);
  }, []);

  // Kept for callers that mount their own dialog view; the provider's dialog is always there.
  const register = useCallback(() => {
    mounted.current += 1;
    return () => {
      mounted.current -= 1;
    };
  }, []);

  const value = useMemo(() => ({ open, cafeSlug, show, setOpen, register }), [open, cafeSlug, show, register]);
  return (
    <PeniKoduContext.Provider value={value}>
      {children}
      <PeniKoduDialog open={open} onOpenChange={setOpen} cafeSlug={cafeSlug} />
    </PeniKoduContext.Provider>
  );
}

/** For triggers. `available` is false when signed out or without any membership: hide the entry. */
export function usePeniKodu(): { available: boolean; show: (cafeSlug?: string) => void } {
  const ctx = useContext(PeniKoduContext);
  const session = useChromeSession();
  return { available: Boolean(ctx && session?.hasMemberships), show: ctx?.show ?? (() => {}) };
}

/** The dialog's open state, for anything that needs to follow it. */
export function usePeniKoduDialog(): { open: boolean; cafeSlug: string | null; setOpen: (open: boolean) => void } {
  const ctx = useContext(PeniKoduContext);
  const register = ctx?.register;
  useEffect(() => register?.(), [register]);
  return { open: ctx?.open ?? false, cafeSlug: ctx?.cafeSlug ?? null, setOpen: ctx?.setOpen ?? (() => {}) };
}
