/**
 * Pure decisions for Siparişler (design-system.md §9.5, §10.4). The same rules as the web page
 * (`apps/web/src/components/order/order-model.ts`), so both platforms list the same history.
 */
import type { OrderDTO, OrderLineDTO } from "@peni/api";
import { cartCopy } from "@peni/brand/copy";
import { capitalizeTr, relDay, TIME_ZONE } from "@peni/brand/format";
import { isActive, reorderSepet } from "@/components/order/order-model";

export { isActive, reorderSepet };

/** Re-read while an order is active and the tab is in focus. */
export const ORDERS_POLL_MS = 10_000;

/** Newest first. */
export function byNewest(a: Pick<OrderDTO, "submittedAt">, b: Pick<OrderDTO, "submittedAt">): number {
  return Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
}

/** What was paid for, by product (the askı unit is never part of a reorder). */
function paidQuantities(lines: readonly OrderLineDTO[]): { productId: string; name: string; quantity: number }[] {
  const out: { productId: string; name: string; quantity: number }[] = [];
  for (const l of lines) {
    if (l.fromAskida || l.quantity <= 0) continue;
    const known = out.find((x) => x.productId === l.productId);
    if (known) known.quantity += l.quantity;
    else out.push({ productId: l.productId, name: l.name, quantity: l.quantity });
  }
  return out;
}

/** "Her zamanki: Latte + Simit" ("Her zamanki: 2 × Çay + Simit"); null when nothing was paid for. */
export function usualLabel(lines: readonly OrderLineDTO[]): string | null {
  const paid = paidQuantities(lines);
  if (!paid.length) return null;
  return `Her zamanki: ${paid.map((p) => (p.quantity > 1 ? cartCopy.line(p.quantity, p.name) : p.name)).join(" + ")}`;
}

/** The history row's items: "Latte, Simit" (every product once, in order). */
export function itemsSummary(lines: readonly OrderLineDTO[]): string {
  const names: string[] = [];
  for (const l of lines) if (!names.includes(l.name)) names.push(l.name);
  return names.join(", ");
}

/** The most recent collected order per café gets "Her zamanki" (§9.5). Returns the order ids. */
export function usualOrderIds(orders: readonly OrderDTO[]): Set<string> {
  const best = new Map<string, OrderDTO>();
  for (const o of orders) {
    if (o.status !== "collected" || !paidQuantities(o.lines).length) continue;
    const known = best.get(o.cafeSlug);
    if (!known || Date.parse(o.submittedAt) > Date.parse(known.submittedAt)) best.set(o.cafeSlug, o);
  }
  return new Set([...best.values()].map((o) => o.id));
}

export interface DayGroup {
  /** "Bugün", "Dün", "Pazartesi", "8 Eki". */
  label: string;
  orders: OrderDTO[];
}

/** GEÇMİŞ: newest first, grouped by the `relDay` of the day the order was placed. */
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

/** ŞİMDİ and GEÇMİŞ. */
export function splitOrders(orders: readonly OrderDTO[]): { active: OrderDTO[]; past: OrderDTO[] } {
  const active = orders.filter((o) => isActive(o.status)).sort(byNewest);
  const past = orders.filter((o) => !isActive(o.status));
  return { active, past };
}
