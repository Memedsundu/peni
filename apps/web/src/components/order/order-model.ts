import type { FulfillmentStatus, OrderDTO, OrderLineDTO } from "@peni/api";
import { activeStatuses, cartCopy, orderCopy, terminalStatuses } from "@peni/brand/copy";
import { capitalizeTr, relDay, TIME_ZONE } from "@peni/brand/format";

/*
 * Pure helpers for the order fiş (§9.4) and Siparişlerim (§9.5). No React, no fetch: these are
 * the decisions the screens make, kept testable.
 */

/** Every 4s while the fiş is visible (§9.4); it stops at a terminal status. */
export const ORDER_POLL_MS = 4_000;
/** Siparişlerim re-reads while an order is active and the page is visible. */
export const ORDERS_POLL_MS = 10_000;

export function isActive(status: FulfillmentStatus): boolean {
  return (activeStatuses as readonly string[]).includes(status);
}

export function isTerminal(status: FulfillmentStatus): boolean {
  return (terminalStatuses as readonly string[]).includes(status);
}

/** Rejected, cancelled or not collected: nothing was paid, the reservations went back. */
export function isVoid(status: FulfillmentStatus): boolean {
  return status === "rejected" || status === "cancelled" || status === "no_show";
}

/** One printed line on the fiş: "1 × Latte ₺120". */
export interface FisLine {
  key: string;
  name: string;
  quantity: number;
  totalKurus: number;
  note: string | null;
}

/**
 * The fiş lines. The server splits an askı unit out into its own line (`fromAskida`); on the
 * printed slip it is merged back into its product, so "2 × Çay" reads as an order and the
 * ikram is only the neutral "İkram −₺30" deduction below (§17: styled exactly like peni, and
 * never "(askıdan)").
 */
export function fisLines(lines: readonly OrderLineDTO[]): FisLine[] {
  const out: FisLine[] = [];
  const byKey = new Map<string, FisLine>();
  for (const l of lines) {
    const key = `${l.productId}|${l.unitPriceKurus}|${l.note ?? ""}`;
    const known = byKey.get(key);
    if (known) {
      known.quantity += l.quantity;
      known.totalKurus += l.unitPriceKurus * l.quantity;
      continue;
    }
    const line: FisLine = { key, name: l.name, quantity: l.quantity, totalKurus: l.unitPriceKurus * l.quantity, note: l.note };
    byKey.set(key, line);
    out.push(line);
  }
  return out;
}

/** Peni used on the order (1 peni = ₺1). */
export function peniUsed(order: Pick<OrderDTO, "peniDiscountKurus">): number {
  return Math.round(order.peniDiscountKurus / 100);
}

/** The product the askı covered, for "Askıdaki çay yerine döndü."; null when no askı was used. */
export function askiItemName(order: Pick<OrderDTO, "askidaKurus" | "lines">): string | null {
  if (order.askidaKurus <= 0) return null;
  return order.lines.find((l) => l.fromAskida)?.name ?? null;
}

/**
 * What the customer paid for, by product, for `?sepet=` and "Her zamanki". The askı unit is
 * left out: a reorder never claims an ikram on the customer's behalf.
 */
export function paidQuantities(lines: readonly OrderLineDTO[]): { productId: string; name: string; quantity: number }[] {
  const out: { productId: string; name: string; quantity: number }[] = [];
  for (const l of lines) {
    if (l.fromAskida || l.quantity <= 0) continue;
    const known = out.find((x) => x.productId === l.productId);
    if (known) known.quantity += l.quantity;
    else out.push({ productId: l.productId, name: l.name, quantity: l.quantity });
  }
  return out;
}

/** `/k/moda?sepet=latte:1,simit:1` (§9.3), or the plain café link when nothing was paid for. */
export function reorderHref(order: Pick<OrderDTO, "cafeSlug" | "lines">): string {
  const base = `/k/${encodeURIComponent(order.cafeSlug)}`;
  const paid = paidQuantities(order.lines);
  if (!paid.length) return base;
  return `${base}?sepet=${paid.map((p) => `${encodeURIComponent(p.productId)}:${p.quantity}`).join(",")}`;
}

/** "Her zamanki: Latte + Simit" ("2 × Çay + Simit"); null when nothing was paid for. */
export function usualLabel(lines: readonly OrderLineDTO[]): string | null {
  const paid = paidQuantities(lines);
  if (!paid.length) return null;
  return `Her zamanki: ${paid.map((p) => (p.quantity > 1 ? cartCopy.line(p.quantity, p.name) : p.name)).join(" + ")}`;
}

/** The history row's items line: "Latte, Simit" (every product once, in order). */
export function itemsSummary(lines: readonly OrderLineDTO[]): string {
  const names: string[] = [];
  for (const l of lines) if (!names.includes(l.name)) names.push(l.name);
  return names.join(", ");
}

/**
 * The most recent collected order per café gets "Her zamanki" (§9.5). Returns the order ids.
 * `orders` may be in any order.
 */
export function usualOrderIds(orders: readonly OrderDTO[]): Set<string> {
  const best = new Map<string, OrderDTO>();
  for (const o of orders) {
    if (o.status !== "collected" || !paidQuantities(o.lines).length) continue;
    const known = best.get(o.cafeSlug);
    if (!known || Date.parse(o.submittedAt) > Date.parse(known.submittedAt)) best.set(o.cafeSlug, o);
  }
  return new Set([...best.values()].map((o) => o.id));
}

/** Newest first. */
export function byNewest(a: Pick<OrderDTO, "submittedAt">, b: Pick<OrderDTO, "submittedAt">): number {
  return Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
}

export interface DayGroup {
  /** "Bugün", "Dün", "Pazartesi", "8 Eki". */
  label: string;
  orders: OrderDTO[];
}

/** GEÇMİŞ (§9.5): newest first, grouped by `relDay` of the day the order was placed. */
export function groupByDay(orders: readonly OrderDTO[], now: Date = new Date(), timeZone: string = TIME_ZONE): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const o of [...orders].sort(byNewest)) {
    const label = capitalizeTr(relDay(o.submittedAt, now, timeZone));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.orders.push(o);
    else groups.push({ label, orders: [o] });
  }
  return groups;
}

/** The order code, or null when the till gave none (the fiş then leads with the headline). */
export function orderCode(order: Pick<OrderDTO, "orderNumber">): string | null {
  return order.orderNumber?.trim() || null;
}

/** "Hazır · P-003" while ready; otherwise "Sipariş P-003 · Peni" (the root template's form). */
export function documentTitle(order: Pick<OrderDTO, "orderNumber" | "status">): string {
  const code = orderCode(order);
  if (order.status === "ready" && code) return orderCopy.readyTitle(code);
  return `${code ? `${orderCopy.headerTitle} ${code}` : orderCopy.headerTitle} · Peni`;
}

/** The sentences under the headline for a closed order that didn't go through (§9.4). */
export function voidNotes(order: OrderDTO): { note: string | null; lines: string[] } {
  const peni = peniUsed(order);
  const aski = order.askidaKurus > 0;
  const askiBack = aski ? orderCopy.rejectedAskiBack(askiItemName(order)) : null;
  switch (order.status) {
    case "rejected":
      return {
        note: order.rejectionReason?.trim() ? orderCopy.rejectedNote(order.rejectionReason.trim()) : null,
        lines: [peni > 0 ? orderCopy.rejectedPeniBack(peni) : null, askiBack].filter((s): s is string => s !== null),
      };
    case "cancelled":
      return { note: null, lines: [peni > 0 ? orderCopy.cancelledPeniBack : null, askiBack].filter((s): s is string => s !== null) };
    case "no_show": {
      // The spec's sentence starts with the peni going back; only say it when peni was used.
      const rule = orderCopy.noShowBody.startsWith(orderCopy.cancelledPeniBack)
        ? orderCopy.noShowBody.slice(orderCopy.cancelledPeniBack.length).trim()
        : orderCopy.noShowBody;
      return {
        note: null,
        lines: [peni > 0 ? orderCopy.cancelledPeniBack : null, askiBack, rule].filter((s): s is string => s !== null),
      };
    }
    default:
      return { note: null, lines: [] };
  }
}

/* ------------------------------------------------------------------------- earn moment (A6) */

const earnKey = (orderId: string) => `peni.earnSeen.${orderId}`;

/** The earn moment plays once per order: when it is seen for the first time, or live. */
export function earnAlreadySeen(orderId: string): boolean {
  try {
    return window.localStorage.getItem(earnKey(orderId)) === "1";
  } catch {
    return false;
  }
}

export function markEarnSeen(orderId: string): void {
  try {
    window.localStorage.setItem(earnKey(orderId), "1");
  } catch {
    // Private mode: it may strike once more next time. Harmless.
  }
}
