/**
 * Carts, one per café slug (design-system.md §12.5), shared by the café screen and the
 * `sepet` sheet. In memory only: a cart is a few taps, never worth restoring after a relaunch.
 *
 * Each cart holds its lines (in the order they were first added), the one askı ikram line,
 * the note, the peni toggle and the idempotency key for "Siparişi gönder". The key stays the
 * same while the cart is unchanged, so a retry after a lost response can't place a second
 * order; any change to the cart draws a new one, and so does a successful send (`clear`).
 */
import { newIdempotencyKey, type CafeDetailDTO, type CreateOrderInput, type MenuItemDTO } from "@peni/api";
import { earnPreview, usablePeni } from "@peni/brand/format";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** The API's per-line cap (`createOrderSchema`). */
export const MAX_QTY = 20;
/** The API's line-count cap. */
export const MAX_LINES = 30;
/** The note's max length (`customerNote`). */
export const MAX_NOTE = 200;

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface CartState {
  lines: CartLine[];
  /** The item taken from the askı as an ikram. Always also one of `lines`. */
  ikramProductId: string | null;
  note: string;
  /** The peni toggle. The amount is always the capped one (D13), from `summarizeCart`. */
  usePeni: boolean;
  idempotencyKey: string;
}

function emptyCart(): CartState {
  return { lines: [], ikramProductId: null, note: "", usePeni: false, idempotencyKey: newIdempotencyKey() };
}

interface CartStore {
  carts: Record<string, CartState>;
  update: (slug: string, fn: (cart: CartState) => CartState) => void;
}

const CartContext = createContext<CartStore | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [carts, setCarts] = useState<Record<string, CartState>>({});
  const update = useCallback((slug: string, fn: (cart: CartState) => CartState) => {
    setCarts((all) => {
      const before = all[slug] ?? emptyCart();
      const after = fn(before);
      return after === before ? all : { ...all, [slug]: after };
    });
  }, []);
  const value = useMemo(() => ({ carts, update }), [carts, update]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** A content change: same fields, fresh idempotency key. */
function changed(cart: CartState, patch: Partial<Omit<CartState, "idempotencyKey">>): CartState {
  return { ...cart, ...patch, idempotencyKey: newIdempotencyKey() };
}

function withQuantity(cart: CartState, productId: string, quantity: number): CartState {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(quantity)));
  const i = cart.lines.findIndex((l) => l.productId === productId);
  const current = i >= 0 ? cart.lines[i]!.quantity : 0;
  if (q === current) return cart;
  if (q > 0 && i < 0 && cart.lines.length >= MAX_LINES) return cart;
  const lines =
    q === 0
      ? cart.lines.filter((l) => l.productId !== productId)
      : i >= 0
        ? cart.lines.map((l) => (l.productId === productId ? { ...l, quantity: q } : l))
        : [...cart.lines, { productId, quantity: q }];
  const ikramProductId = q === 0 && cart.ikramProductId === productId ? null : cart.ikramProductId;
  return changed(cart, { lines, ikramProductId });
}

export interface Cart extends CartState {
  slug: string;
  /** Total quantity across lines ("2 ürün"). */
  count: number;
  isEmpty: boolean;
  quantityOf: (productId: string) => number;
  /** Adds (or with a negative `by`, removes) items; clamps to 0…20. */
  add: (productId: string, by?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  /** Takes `productId` from the askı (adding one if it isn't in the cart yet), or clears it. */
  setIkram: (productId: string | null) => void;
  setNote: (note: string) => void;
  setUsePeni: (on: boolean) => void;
  /**
   * Drops lines the menu no longer sells (gone or `available: false`) and returns their
   * names, for "Simit şu an tükendi; sepetine eklemedik."
   */
  reconcile: (menu: readonly MenuItemDTO[]) => string[];
  /**
   * Replaces every line at once (reorders from `?sepet=`, "Her zamanki"): the cart then holds
   * exactly these, clamped and de-duplicated; the ikram, note and peni toggle are reset.
   */
  replaceLines: (lines: readonly CartLine[]) => void;
  /** Draws a new idempotency key without changing the cart (after a failed send, §9.3). */
  renewKey: () => void;
  /** Empties the cart and draws a new key. Call after a successful send. */
  clear: () => void;
  /** The request body for `api.orders.create`, with the capped peni amount. */
  orderInput: (usePeniAmount: number) => CreateOrderInput;
}

/** The cart for one café. */
export function useCart(slug: string): Cart {
  const store = useContext(CartContext);
  if (!store) throw new Error("useCart outside CartProvider");
  const { carts, update } = store;
  const state = carts[slug];

  return useMemo<Cart>(() => {
    const cart = state ?? emptyCart();
    const set = (fn: (c: CartState) => CartState) => update(slug, fn);
    const count = cart.lines.reduce((n, l) => n + l.quantity, 0);
    return {
      ...cart,
      slug,
      count,
      isEmpty: count === 0,
      quantityOf: (id) => cart.lines.find((l) => l.productId === id)?.quantity ?? 0,
      add: (id, by = 1) =>
        set((c) => withQuantity(c, id, (c.lines.find((l) => l.productId === id)?.quantity ?? 0) + by)),
      setQuantity: (id, q) => set((c) => withQuantity(c, id, q)),
      remove: (id) => set((c) => withQuantity(c, id, 0)),
      setIkram: (id) =>
        set((c) => {
          if (id === c.ikramProductId) return c;
          if (id === null) return changed(c, { ikramProductId: null });
          const withItem = c.lines.some((l) => l.productId === id) ? c : withQuantity(c, id, 1);
          if (!withItem.lines.some((l) => l.productId === id)) return c; // line cap reached
          return changed(withItem, { ikramProductId: id });
        }),
      setNote: (note) => set((c) => (note === c.note ? c : changed(c, { note: note.slice(0, MAX_NOTE) }))),
      setUsePeni: (on) => set((c) => (on === c.usePeni ? c : changed(c, { usePeni: on }))),
      reconcile: (menu) => {
        const byId = new Map(menu.map((m) => [m.productId, m]));
        const dropped = cart.lines
          .filter((l) => !byId.get(l.productId)?.available)
          .map((l) => byId.get(l.productId)?.name)
          .filter((n): n is string => !!n);
        set((c) => {
          const keep = c.lines.filter((l) => byId.get(l.productId)?.available);
          if (keep.length === c.lines.length) return c;
          const ikram = keep.some((l) => l.productId === c.ikramProductId) ? c.ikramProductId : null;
          return changed(c, { lines: keep, ikramProductId: ikram });
        });
        return dropped;
      },
      replaceLines: (next) =>
        set(() => {
          const merged = new Map<string, number>();
          for (const l of next) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);
          const lines = [...merged]
            .map(([productId, q]) => ({ productId, quantity: Math.max(0, Math.min(MAX_QTY, Math.floor(q))) }))
            .filter((l) => l.quantity > 0)
            .slice(0, MAX_LINES);
          return { ...emptyCart(), lines };
        }),
      renewKey: () => set((c) => ({ ...c, idempotencyKey: newIdempotencyKey() })),
      clear: () => update(slug, () => emptyCart()),
      orderInput: (usePeniAmount) => ({
        cafeSlug: slug,
        lines: cart.lines.map(({ productId, quantity }) => ({ productId, quantity })),
        usePeni: cart.usePeni ? Math.max(0, Math.floor(usePeniAmount)) : 0,
        askidaProductId: cart.ikramProductId,
        customerNote: cart.note.trim() || undefined,
        idempotencyKey: cart.idempotencyKey,
      }),
    };
  }, [state, slug, update]);
}

/* ========================================================================================== */
/* Totals (D12, D13)                                                                          */
/* ========================================================================================== */

export interface CartItem extends CartLine {
  item: MenuItemDTO;
  lineKurus: number;
  /** This line holds the askı ikram (one of its items is free). */
  ikram: boolean;
}

export interface CartSummary {
  items: CartItem[];
  count: number;
  subtotalKurus: number;
  /** The ikram's price, shown as "İkram −₺30". */
  askidaKurus: number;
  /** What the peni toggle offers: `min(balance, share cap, due)`. 0 for non-members. */
  usablePeni: number;
  /** Applied when the toggle is on. */
  peniApplied: number;
  /** Paid at the till. */
  dueKurus: number;
  /** "Kasada ödeyince +2 peni kazanırsın": earned on what is paid at the till only. */
  earnPeni: number;
}

type CafeTerms = Pick<CafeDetailDTO, "menu" | "maxRedeemSharePercent" | "earnRatePercent" | "membership">;

/** Prices always come from the café's menu; unknown products are skipped. */
export function summarizeCart(
  cart: Pick<CartState, "lines" | "ikramProductId" | "usePeni">,
  cafe: CafeTerms,
): CartSummary {
  const menu = new Map(cafe.menu.map((m) => [m.productId, m]));
  const items: CartItem[] = [];
  for (const l of cart.lines) {
    const item = menu.get(l.productId);
    if (!item) continue;
    items.push({ ...l, item, lineKurus: item.priceKurus * l.quantity, ikram: l.productId === cart.ikramProductId });
  }
  const subtotalKurus = items.reduce((s, i) => s + i.lineKurus, 0);
  const askidaKurus = items.find((i) => i.ikram)?.item.priceKurus ?? 0;
  const usable = cafe.membership
    ? usablePeni({
        balance: cafe.membership.balancePeni,
        subtotalKurus,
        askidaKurus,
        maxRedeemSharePercent: cafe.maxRedeemSharePercent,
      })
    : 0;
  const peniApplied = cart.usePeni ? usable : 0;
  const dueKurus = Math.max(0, subtotalKurus - askidaKurus - peniApplied * 100);
  return {
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotalKurus,
    askidaKurus,
    usablePeni: usable,
    peniApplied,
    dueKurus,
    earnPeni: earnPreview(dueKurus, cafe.earnRatePercent),
  };
}
