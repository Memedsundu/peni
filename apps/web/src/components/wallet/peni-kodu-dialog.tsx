"use client";

import { PeniApiError, type WalletCafeDTO } from "@peni/api";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Coin } from "@/components/brand";
import { Banner, Button, Chip, Sheet, Skeleton } from "@/components/ui";
import { peni } from "@/lib/client";
import { QrCode } from "./qr-code";

/*
 * Peni kodum (design-system.md §9.6, [G7b]): a Dialog from 768px, a full-screen Drawer on
 * phones (`Sheet fullScreenOnPhone`). Café chips when there is more than one membership, the
 * QR code (240px, light ink on white, quiet zone 4), the code in Brygada 600 40px, tabular,
 * tracked .08em, "Kasada bu kodu göster, peni kazan." and "Kapat".
 *
 * On phones the café chips stack, each as wide as the QR code under them: one even column,
 * every name whole, however many cafés (a centred wrap gave rows of different widths). In the
 * desktop dialog they sit in one centred row.
 *
 * The memberships come from the wallet. The Cüzdan page primes them (`primePeniKodu`), so the
 * dialog opens there with no wait; anywhere else it shows the last ones it saw while it
 * fetches fresh ones. The chosen café is remembered per viewer (localStorage, best effort).
 */

type Membership = Pick<WalletCafeDTO, "cafeSlug" | "cafeName" | "district" | "memberCode">;

let cache: Membership[] | null = null;

/** Hand the dialog the memberships the page already has. */
export function primePeniKodu(cafes: readonly Membership[]): void {
  cache = cafes.map(({ cafeSlug, cafeName, district, memberCode }) => ({ cafeSlug, cafeName, district, memberCode }));
}

const LAST_KEY = "peni.koduCafe";

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

function writeLast(slug: string): void {
  try {
    localStorage.setItem(LAST_KEY, slug);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

export interface PeniKoduDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open on this café's code (a café page's own entry point). */
  cafeSlug?: string | null;
}

export function PeniKoduDialog({ open, onOpenChange, cafeSlug }: PeniKoduDialogProps) {
  const [cafes, setCafes] = useState<Membership[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = await peni.wallet.get();
      primePeniKodu(w.cafes);
      setCafes(cache);
    } catch (e) {
      setError(e instanceof PeniApiError && e.status === 401 ? "Peni kodunu görmek için giriş yap." : e instanceof Error ? e.message : errorCopy.generic);
    }
  }, []);

  // Each opening: the freshest list we have, then a quiet refresh; the café the trigger named,
  // else the one shown last time, else the first.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCafes(cache);
      setSelected(cafeSlug ?? readLast());
    }
  }
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const current = cafes?.find((c) => c.cafeSlug === selected) ?? cafes?.[0] ?? null;
  const many = (cafes?.length ?? 0) > 1;

  const choose = (slug: string) => {
    setSelected(slug);
    writeLast(slug);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={peniCopy.peniCode}
      fullScreenOnPhone
      initialFocus={closeRef}
      bodyClassName="flex flex-col"
      footer={
        <Button ref={closeRef} variant="secondary" fullWidth onClick={() => onOpenChange(false)}>
          {actionCopy.close}
        </Button>
      }
    >
      <div className="my-auto flex flex-col items-center gap-5 py-2 text-center">
        {many && cafes && (
          <div role="group" aria-label="Kafe" className="flex w-60 flex-col gap-2 md:w-auto md:flex-row md:flex-wrap md:justify-center">
            {cafes.map((c) => (
              <Chip key={c.cafeSlug} kind="choice" selected={c.cafeSlug === current?.cafeSlug} onClick={() => choose(c.cafeSlug)}>
                {c.cafeName}
              </Chip>
            ))}
          </div>
        )}

        {current ? (
          <>
            {!many && (
              <p className="flex items-center gap-2 text-button text-ink">
                <Coin size={28} cafe={{ name: current.cafeName, district: current.district, slug: current.cafeSlug }} />
                {current.cafeName}
              </p>
            )}
            <div className="overflow-hidden rounded-[14px] ring-1 ring-line">
              <QrCode value={current.memberCode} size={240} />
            </div>
            <div className="flex flex-col items-center gap-2" aria-live="polite">
              <p className="font-display text-[40px] leading-none font-semibold tracking-[.08em] text-ink tabular-nums lining-nums">
                <span className="sr-only">{current.cafeName} için Peni kodun: </span>
                {current.memberCode}
              </p>
              <p className="max-w-[30ch] text-body-lg text-ink-2">{peniCopy.peniCodeBody}</p>
            </div>
          </>
        ) : error ? (
          <Banner
            tone="danger"
            title={error}
            className="w-full text-left"
            action={
              <Button size="sm" variant="secondary" onClick={() => void load()}>
                {errorCopy.retry}
              </Button>
            }
          />
        ) : cafes && cafes.length === 0 ? (
          <p className="max-w-[30ch] text-body-lg text-ink-2">Peni kodun, bir kafeye katılınca burada olur.</p>
        ) : (
          <div aria-busy="true" className="flex flex-col items-center gap-5">
            <span className="sr-only">Yükleniyor</span>
            <Skeleton radius={14} className="size-60" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-4 w-56" />
          </div>
        )}
      </div>
    </Sheet>
  );
}
