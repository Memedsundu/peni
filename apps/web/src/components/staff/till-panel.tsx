"use client";

import { newIdempotencyKey, type AskidaDTO, type MenuItemDTO } from "@peni/api";
import { askiCopy, errorCopy } from "@peni/brand/copy";
import { formatPeni, SEP } from "@peni/brand/format";
import { askiItemFor } from "@peni/brand/shapes";
import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AskiCaption, AskiRail, HookGlyph, type HangSignal } from "@/components/brand";
import { Banner, Button, Card, Skeleton, Stepper, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { itemsFor, tillItems, tillSelection, tillSubmitLabel, tillToastText } from "./model";

/**
 * Askı tab (design-system.md §9.10, §6.2): the café's hook rail with its caption, and the till:
 * "Kasada askıya bırakılanlar", one stepper row per askı item ("Çay · 30 peni" [− n +]) and
 * "Askıya ekle · 2 çay (60 peni)". Success hangs the new items on the rail (A8, the staff till is
 * one of the two places cup-hang plays) and toasts "Askıya 2 çay eklendi."; a failure stays
 * inline under the button with the counts kept.
 *
 * Dignity (§17): nothing here names or counts anyone who takes; the weekly ikram line hides
 * counts below 3 (AskiCaption).
 */
export function TillPanel({
  slug,
  askida,
  onDonated,
}: {
  slug: string;
  askida: AskidaDTO;
  /** Write the new pool into the board's data (same render as the hang signal). */
  onDonated: (next: { balancePeni: number; itemsAvailable: number; donatedPeni: number }) => void;
}) {
  const [menu, setMenu] = useState<MenuItemDTO[] | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hang, setHang] = useState<HangSignal>({ n: 0 });
  const idemKey = useRef<string | null>(null);

  const loadMenu = useCallback(async () => {
    setMenuError(null);
    try {
      const cafe = await peni.cafes.get(slug);
      setMenu(cafe.menu);
    } catch (e) {
      setMenuError(e instanceof Error && e.message ? e.message : errorCopy.generic);
    }
  }, [slug]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const items = useMemo(() => (menu ? tillItems(menu) : []), [menu]);
  const selection = tillSelection(items, counts);
  const referencePeni = useMemo(() => {
    const ref = askida.referenceItemName && menu?.find((m) => m.name === askida.referenceItemName);
    return ref ? Math.ceil(ref.priceKurus / 100) : null;
  }, [askida.referenceItemName, menu]);

  const setCount = (productId: string, n: number) => {
    setCounts((c) => ({ ...c, [productId]: n }));
    setError(null);
    idemKey.current = null; // a different selection is a different donation
  };

  const submit = async () => {
    if (busy || selection.count === 0) return;
    setBusy(true);
    setError(null);
    idemKey.current ??= newIdempotencyKey();
    try {
      const res = await peni.staff.tillDonation(slug, { peni: selection.peni, idempotencyKey: idemKey.current });
      const before = askida.itemsAvailable;
      const after = itemsFor(res.balancePeni, referencePeni) ?? before;
      onDonated({ balancePeni: res.balancePeni, itemsAvailable: after, donatedPeni: selection.peni });
      setHang((h) => ({ n: (typeof h === "number" ? h : h.n) + 1, count: Math.max(0, after - before) }));
      toast(tillToastText(selection));
      setCounts({});
      idemKey.current = null;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : errorCopy.generic);
    } finally {
      setBusy(false);
    }
  };

  const item = askiItemFor(askida.referenceItemName);

  return (
    // The rail panel is exactly twelve 28px slots wide (+ padding) from 1024px; the till takes the rest.
    <div className="grid max-w-[640px] items-start gap-6 lg:max-w-[960px] lg:grid-cols-[23.5rem_minmax(0,1fr)] lg:gap-8">
      <section aria-labelledby="aski-rail-title" className="rounded-[14px] bg-aski-soft p-4 text-ink md:p-5">
        <h2 id="aski-rail-title" className="flex min-h-11 items-center gap-2 text-aski-ink">
          <HookGlyph size={20} />
          <span className="legend">{askiCopy.legend}</span>
        </h2>
        <AskiRail count={askida.itemsAvailable} item={item} size="md" hangSignal={hang} className="mt-3" />
        <AskiCaption askida={askida} className="mt-3" />
      </section>

      <Card as="section" padding="none" aria-labelledby="till-title" aria-busy={menu == null && !menuError ? true : undefined}>
        <div className="px-4 pt-4 pb-3 md:px-5 md:pt-5">
          <h2 id="till-title" className="font-display text-h3 text-ink">
            {askiCopy.till.title}
          </h2>
          <p className="mt-1 text-body text-ink-2">Kasada askı için ödeme alınca buradan ekle.</p>
        </div>

        {menuError ? (
          <div className="px-4 pb-4 md:px-5 md:pb-5">
            <Banner
              tone="danger"
              title={menuError}
              action={
                <Button variant="secondary" size="sm" onClick={() => void loadMenu()}>
                  {errorCopy.retry}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line border-y border-line">
              {menu == null
                ? [0, 1, 2].map((i) => (
                    <li key={i} aria-hidden className="flex min-h-16 items-center justify-between gap-3 px-4 md:px-5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton radius="full" className="h-11 w-[116px]" />
                    </li>
                  ))
                : items.map((it) => (
                    <li key={it.productId} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2 md:px-5">
                      <p className="min-w-0 text-body text-ink">
                        <span className="font-semibold">{it.name}</span>
                        <span className="text-ink-2">
                          {SEP}
                          {formatPeni(it.peni)}
                        </span>
                      </p>
                      <Stepper
                        value={counts[it.productId] ?? 0}
                        onChange={(n) => setCount(it.productId, n)}
                        itemName={it.name}
                        collapsible={false}
                        max={20}
                      />
                    </li>
                  ))}
            </ul>
            <div className="p-4 md:p-5">
              <Button
                size="lg"
                fullWidth
                loading={busy}
                disabled={selection.count === 0}
                disabledReason={selection.count === 0 && menu != null ? "Önce adet seç." : undefined}
                onClick={submit}
              >
                {tillSubmitLabel(selection)}
              </Button>
              <div aria-live="polite">
                {error && (
                  <p className="mt-2 flex items-start gap-1.5 text-meta text-danger">
                    <CircleAlert aria-hidden size={16} strokeWidth={1.75} absoluteStrokeWidth className="mt-px size-4 shrink-0" />
                    <span>{errorCopy.save(error)}</span>
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** Loading state for the tab: the panel and the till card with their real geometry. */
export function TillSkeleton() {
  return (
    <div aria-hidden className="grid max-w-[640px] items-start gap-6 lg:max-w-[960px] lg:grid-cols-[23.5rem_minmax(0,1fr)] lg:gap-8">
      <Skeleton radius={14} className="h-[188px] w-full" />
      <Skeleton radius={14} className="h-[360px] w-full" />
    </div>
  );
}
