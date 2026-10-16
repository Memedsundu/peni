"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useChromeSession } from "./session";

/**
 * "Peni kodum" (design-system.md §9.6): the top bar, Profil and Cüzdan all open the same
 * dialog. Triggers call `usePeniKodu().show()`; the dialog (PeniKoduDialog, built with the
 * wallet) reads `usePeniKoduDialog()` and should be mounted once in (customer)/layout.tsx.
 * Until a dialog is mounted, `show()` falls back to the wallet, where the codes live.
 * Without a membership [G7b] there is no code, so every entry point is hidden.
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cafeSlug, setCafeSlug] = useState<string | null>(null);
  const mounted = useRef(0);

  const show = useCallback(
    (slug?: string) => {
      setCafeSlug(slug ?? null);
      if (mounted.current > 0) setOpen(true);
      else router.push(PENI_KODU_FALLBACK_HREF);
    },
    [router],
  );

  const register = useCallback(() => {
    mounted.current += 1;
    return () => {
      mounted.current -= 1;
    };
  }, []);

  const value = useMemo(() => ({ open, cafeSlug, show, setOpen, register }), [open, cafeSlug, show, register]);
  return <PeniKoduContext.Provider value={value}>{children}</PeniKoduContext.Provider>;
}

/** For triggers. `available` is false when signed out or without any membership: hide the entry. */
export function usePeniKodu(): { available: boolean; show: (cafeSlug?: string) => void } {
  const ctx = useContext(PeniKoduContext);
  const session = useChromeSession();
  return { available: Boolean(ctx && session?.hasMemberships), show: ctx?.show ?? (() => {}) };
}

/** For the dialog itself. Registers it while mounted so triggers open it in place. */
export function usePeniKoduDialog(): { open: boolean; cafeSlug: string | null; setOpen: (open: boolean) => void } {
  const ctx = useContext(PeniKoduContext);
  const register = ctx?.register;
  useEffect(() => register?.(), [register]);
  return { open: ctx?.open ?? false, cafeSlug: ctx?.cafeSlug ?? null, setOpen: ctx?.setOpen ?? (() => {}) };
}
