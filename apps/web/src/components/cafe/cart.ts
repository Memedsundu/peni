"use client";

import type { CafeDetailDTO, CreateOrderInput, MenuItemDTO } from "@peni/api";
import { earnPreview, usablePeni } from "@peni/brand/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** The server's per-line limit (`createOrderSchema`). */
export const MAX_PER_LINE = 20;

/**
 * The café cart (design-system.md §9.3). Paid quantities per product, plus at most one ikram
 * from the askı: one unit of a product that the order sends as `askidaProductId` (and that the
 * server needs inside `lines`, so it is merged in on submit).
 */
export interface CartState {
  lines: Record<string, number>;
  ikram: string | null;
  note: string;
  usePeni: boolean;
}

export const EMPTY_CART: CartState = { lines: {}, ikram: null, note: "", usePeni: false };

export interface CartLine {
  item: MenuItemDTO;
  /** What the slip shows: paid units plus the ikram unit when it is this product ("2 × Çay"). */
  qty: number;
  /** Paid units only. */
  paid: number;
  /** This line carries the ikram unit. */
  ikram: boolean;
  totalKurus: number;
}

export interface CartTotals {
  /** Lines in menu order, the ikram unit merged into its product (as the order fiş shows it). */
  lines: CartLine[];
  /** Products that went out of stock after they were added: kept out of the order and the totals. */
  soldOut: MenuItemDTO[];
  ikramItem: MenuItemDTO | null;
  /** Every unit, the ikram included: "2 ürün". */
  count: number;
  subtotalKurus: number;
  askidaKurus: number;
  balance: number;
  /** D13: the capped amount the toggle offers. */
  usable: number;
  /** The cap is below the balance: show "Bu siparişte en fazla 55 peni kullanabilirsin." */
  capped: boolean;
  appliedPeni: number;
  dueKurus: number;
  /** D12: peni earned on what is paid at the till. */
  earn: number;
}

export function cartTotals(cafe: CafeDetailDTO, state: CartState): CartTotals {
  const lines: CartLine[] = [];
  const soldOut: MenuItemDTO[] = [];
  let ikramItem: MenuItemDTO | null = null;
  let subtotal = 0;
  let count = 0;
  for (const item of cafe.menu) {
    const paid = state.lines[item.productId] ?? 0;
    const ikram = state.ikram === item.productId;
    if (paid <= 0 && !ikram) continue;
    if (!item.available) {
      soldOut.push(item);
      continue;
    }
    if (ikram) ikramItem = item;
    const qty = paid + (ikram ? 1 : 0);
    lines.push({ item, qty, paid, ikram, totalKurus: item.priceKurus * qty });
    subtotal += item.priceKurus * qty;
    count += qty;
  }
  const askidaKurus = ikramItem?.priceKurus ?? 0;
  const balance = cafe.membership?.balancePeni ?? 0;
  const usable = usablePeni({
    balance,
    subtotalKurus: subtotal,
    askidaKurus,
    maxRedeemSharePercent: cafe.maxRedeemSharePercent,
  });
  const appliedPeni = state.usePeni ? usable : 0;
  const dueKurus = Math.max(0, subtotal - askidaKurus - appliedPeni * 100);
  return {
    lines,
    soldOut,
    ikramItem,
    count,
    subtotalKurus: subtotal,
    askidaKurus,
    balance,
    usable,
    capped: usable > 0 && usable < balance,
    appliedPeni,
    dueKurus,
    earn: earnPreview(dueKurus, cafe.earnRatePercent),
  };
}

/** The order request: the ikram unit is merged into its product's line, as the server expects. */
export function orderInput(slug: string, state: CartState, totals: CartTotals, idempotencyKey: string): CreateOrderInput {
  const note = state.note.trim();
  return {
    cafeSlug: slug,
    lines: totals.lines.map((l) => ({ productId: l.item.productId, quantity: Math.min(MAX_PER_LINE, l.qty) })),
    usePeni: totals.appliedPeni,
    askidaProductId: totals.ikramItem?.productId ?? null,
    customerNote: note || undefined,
    idempotencyKey,
  };
}

/** `?sepet=latte:1,simit:1` → `[["latte",1],["simit",1]]`. Bad pairs are skipped. */
export function parseSepet(raw: string | null | undefined): [string, number][] {
  if (!raw) return [];
  const out: [string, number][] = [];
  for (const part of raw.split(",")) {
    const [id, n] = part.split(":");
    const productId = id?.trim();
    const quantity = n === undefined ? 1 : Number.parseInt(n, 10);
    if (productId && Number.isFinite(quantity) && quantity > 0) out.push([productId, Math.min(MAX_PER_LINE, quantity)]);
  }
  return out;
}

/** "Simit", "Simit ve Latte", "Simit, Latte ve Çay". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`;
}

const storageKey = (slug: string) => `peni.cart.${slug}`;

function readStored(slug: string): CartState | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CartState>;
    const lines: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.lines ?? {})) if (typeof n === "number" && n > 0) lines[k] = Math.min(MAX_PER_LINE, n);
    return {
      lines,
      ikram: typeof v.ikram === "string" ? v.ikram : null,
      note: typeof v.note === "string" ? v.note.slice(0, 200) : "",
      usePeni: v.usePeni === true,
    };
  } catch {
    return null;
  }
}

function writeStored(slug: string, state: CartState): void {
  try {
    const empty = Object.keys(state.lines).length === 0 && !state.ikram && !state.note;
    if (empty) window.sessionStorage.removeItem(storageKey(slug));
    else window.sessionStorage.setItem(storageKey(slug), JSON.stringify(state));
  } catch {
    // Private mode or blocked storage: the cart just lives as long as the page.
  }
}

/**
 * The cart for one café. It survives a reload or a trip to /giris in sessionStorage (a per-tab
 * convenience; the order itself is the source of truth). `restored` turns true after the first
 * client read, so a `?sepet=` prefill can replace what was stored.
 */
export function useCafeCart(slug: string) {
  const [state, setState] = useState<CartState>(EMPTY_CART);
  const [restored, setRestored] = useState(false);
  const slugRef = useRef(slug);
  const frozen = useRef(false);

  useEffect(() => {
    slugRef.current = slug;
    const stored = readStored(slug);
    setState(stored ?? EMPTY_CART);
    setRestored(true);
  }, [slug]);

  useEffect(() => {
    if (restored && !frozen.current) writeStored(slugRef.current, state);
  }, [state, restored]);

  /** The order went through: forget the stored cart now, while the page leaves for the fiş. */
  const forget = useCallback(() => {
    frozen.current = true;
    writeStored(slugRef.current, EMPTY_CART);
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setState((s) => {
      const lines = { ...s.lines };
      if (qty > 0) lines[productId] = Math.min(MAX_PER_LINE, qty);
      else delete lines[productId];
      return { ...s, lines };
    });
  }, []);

  const add = useCallback((productId: string) => {
    setState((s) => {
      const max = s.ikram === productId ? MAX_PER_LINE - 1 : MAX_PER_LINE;
      return { ...s, lines: { ...s.lines, [productId]: Math.min(max, (s.lines[productId] ?? 0) + 1) } };
    });
  }, []);

  /** The sheet stepper works on the merged line: paid units go first, the ikram unit last. */
  const setLineQty = useCallback((productId: string, qty: number) => {
    setState((s) => {
      const hasIkram = s.ikram === productId;
      const paid = Math.max(0, Math.min(MAX_PER_LINE, qty) - (hasIkram ? 1 : 0));
      const lines = { ...s.lines };
      if (paid > 0) lines[productId] = paid;
      else delete lines[productId];
      return { ...s, lines, ikram: hasIkram && qty <= 0 ? null : s.ikram };
    });
  }, []);

  const replaceLines = useCallback((entries: [string, number][]) => {
    setState((s) => ({ ...s, lines: Object.fromEntries(entries) }));
  }, []);

  const setIkram = useCallback((productId: string | null) => setState((s) => ({ ...s, ikram: productId })), []);
  const setNote = useCallback((note: string) => setState((s) => ({ ...s, note })), []);
  const setUsePeni = useCallback((usePeni: boolean) => setState((s) => ({ ...s, usePeni })), []);
  const clear = useCallback(() => setState(EMPTY_CART), []);

  const actions = useMemo(
    () => ({ setQty, setLineQty, add, replaceLines, setIkram, setNote, setUsePeni, clear, forget }),
    [setQty, setLineQty, add, replaceLines, setIkram, setNote, setUsePeni, clear, forget],
  );
  return { state, restored, ...actions };
}

export type CafeCart = ReturnType<typeof useCafeCart>;
