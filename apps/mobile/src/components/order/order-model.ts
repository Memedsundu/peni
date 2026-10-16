/**
 * Pure decisions for the order fiş (design-system.md §9.4, §10.3). No React, no fetch: the
 * same rules as the web fiş (`apps/web/src/components/order/order-model.ts`), so both
 * platforms print the same slip.
 */
import type { FulfillmentStatus, OrderDTO, OrderLineDTO } from "@peni/api";
import { activeStatuses, cartCopy, orderCopy, statusWords, terminalStatuses } from "@peni/brand/copy";
import { capitalizeTr, relDay, SEP } from "@peni/brand/format";

/** Every 4s while the fiş is on screen and the app is active (§10.3); it stops at a terminal status. */
export const ORDER_POLL_MS = 4_000;

/** Two missed polls in a row before the screen says so (one miss is usually a tunnel). */
export const POLL_FAILURES_SHOWN = 2;

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

/** The order code, or null when the till gave none (the fiş then leads with the headline). */
export function orderCode(order: Pick<OrderDTO, "orderNumber">): string | null {
  return order.orderNumber?.trim() || null;
}

/** One printed line: "1 × Latte ₺120". */
export interface FisLine {
  key: string;
  label: string;
  totalKurus: number;
  note: string | null;
}

/**
 * The fiş lines. The server splits an askı unit into its own line (`fromAskida`); on the slip
 * it is merged back into its product, so "2 × Çay" reads as an order and the ikram is only the
 * neutral "İkram −₺30" deduction below (§17: styled exactly like peni, never "(askıdan)").
 */
export function fisLines(lines: readonly OrderLineDTO[]): FisLine[] {
  const out: (FisLine & { name: string; quantity: number })[] = [];
  const byKey = new Map<string, (typeof out)[number]>();
  for (const l of lines) {
    const key = `${l.productId}|${l.unitPriceKurus}|${l.note ?? ""}`;
    const known = byKey.get(key);
    if (known) {
      known.quantity += l.quantity;
      known.totalKurus += l.unitPriceKurus * l.quantity;
      continue;
    }
    const line = { key, name: l.name, quantity: l.quantity, label: "", totalKurus: l.unitPriceKurus * l.quantity, note: l.note };
    byKey.set(key, line);
    out.push(line);
  }
  return out.map(({ key, name, quantity, totalKurus, note }) => ({
    key,
    label: cartCopy.line(quantity, name),
    totalKurus,
    note: note?.trim() || null,
  }));
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

/** The peni this collected order put in the wallet [G7], or null (none, or not collected yet). */
export function earnedPeni(order: Pick<OrderDTO, "status" | "earnedPeni">): number | null {
  return order.status === "collected" && order.earnedPeni != null && order.earnedPeni > 0 ? order.earnedPeni : null;
}

/** "Ayşe Yılmaz", or "Ayşe Yılmaz · Dün" for an order from another day. */
export function whoLine(order: Pick<OrderDTO, "customerName" | "submittedAt">, now: Date = new Date()): string {
  const day = relDay(order.submittedAt, now);
  return [order.customerName.trim(), day !== "bugün" ? capitalizeTr(day) : null].filter(Boolean).join(SEP);
}

/**
 * The headline (§9.4 table). Accepted gets "· genelde 4–8 dk" only with the café's real
 * median data [G14]; never an invented ETA (principle 3).
 */
export function headline(order: Pick<OrderDTO, "status">, prepRange?: { low: number; high: number } | null): string {
  if (order.status === "accepted" && prepRange && prepRange.high > 0) {
    // "genelde 4–8 dk" is one phrase: on a narrow slip it moves down whole, never leaving "dk" alone.
    // Word joiners hold the en dash too (text may break after "–").
    return orderCopy
      .acceptedWithMedian(prepRange.low, prepRange.high)
      .replace(/genelde (\d+)–(\d+) dk/, `genelde${NBSP}$1${WJ}–${WJ}$2${NBSP}dk`);
  }
  return orderCopy.headline[order.status];
}

const NBSP = " ";
/** U+2060 WORD JOINER: no break here, no width. */
const WJ = "⁠";

/**
 * Typesetting for the slip's sentences: the last two words never split, so a narrow phone
 * never ends a headline on one short word ("…₺145 / öde.").
 */
export function noWidow(s: string): string {
  // A "·" stays with the word before it (as in `Amount`), so a wrapped line never starts with it.
  const bound = s.replace(/ · /g, `${NBSP}· `);
  const i = bound.lastIndexOf(" ");
  if (i <= 0) return bound;
  // Only a short, plain last word is pulled to its neighbour; a bound phrase already moves whole.
  const tail = bound.slice(i + 1);
  if (tail.includes(NBSP) || [...tail].length > 10) return bound;
  return `${bound.slice(0, i)}${NBSP}${tail}`;
}

/** The sentences under the headline for an order that didn't go through (§9.4). */
export function voidNotes(order: OrderDTO): { note: string | null; lines: string[] } {
  const peni = peniUsed(order);
  const askiBack = order.askidaKurus > 0 ? orderCopy.rejectedAskiBack(askiItemName(order)) : null;
  const keep = (s: string | null): s is string => s !== null;
  switch (order.status) {
    case "rejected":
      return {
        note: order.rejectionReason?.trim() ? orderCopy.rejectedNote(order.rejectionReason.trim()) : null,
        lines: [peni > 0 ? orderCopy.rejectedPeniBack(peni) : null, askiBack].filter(keep),
      };
    case "cancelled":
      return { note: null, lines: [peni > 0 ? orderCopy.cancelledPeniBack : null, askiBack].filter(keep) };
    case "no_show": {
      // The spec's sentence starts with the peni going back; say that part only when peni was used.
      const rule = orderCopy.noShowBody.startsWith(orderCopy.cancelledPeniBack)
        ? orderCopy.noShowBody.slice(orderCopy.cancelledPeniBack.length).trim()
        : orderCopy.noShowBody;
      return { note: null, lines: [peni > 0 ? orderCopy.cancelledPeniBack : null, askiBack, rule].filter(keep) };
    }
    default:
      return { note: null, lines: [] };
  }
}

/**
 * What the customer paid for, by product, for "Yeniden sipariş ver" (`?sepet=latte:1,simit:1`,
 * §9.4). The askı unit is left out: a reorder never claims an ikram on the customer's behalf.
 */
export function reorderSepet(lines: readonly OrderLineDTO[]): string | null {
  const out: { productId: string; quantity: number }[] = [];
  for (const l of lines) {
    if (l.fromAskida || l.quantity <= 0) continue;
    const known = out.find((x) => x.productId === l.productId);
    if (known) known.quantity += l.quantity;
    else out.push({ productId: l.productId, quantity: l.quantity });
  }
  return out.length ? out.map((p) => `${p.productId}:${p.quantity}`).join(",") : null;
}

/** The order announced and shown in the accessory / pill: "P-003 · Hazırlanıyor". */
export function chipLabel(order: Pick<OrderDTO, "orderNumber" | "status">): string {
  const code = orderCode(order);
  return code ? orderCopy.chip(code, order.status) : statusWords[order.status];
}
