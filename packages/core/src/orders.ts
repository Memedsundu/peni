import type { Kurus } from "./money";

/**
 * Siparişler (plan piece 6): what the till sells. Prices come from the menu on the
 * server; amounts are whole kuruş with one rounding rule, so the till, the receipt
 * and the reports always agree (Shelby stored floats and rounded at the edges).
 */

export type OrderStatus = "open" | "paid" | "voided" | "refunded";
export type PaymentMethod = "cash" | "card";

export interface OrderLine {
  productId: string;
  /** As on the menu when it was added; later menu changes don't rewrite past orders. */
  name: string;
  unitPriceKurus: Kurus;
  quantity: number;
  /** 0–100, whole percent. */
  discountPercent: number;
}

export interface Order {
  id: string;
  cafeId: string;
  /** Per café, starting at 1 each local day: "#42". */
  number: number;
  /** The café's local date, "YYYY-MM-DD". */
  businessDay: string;
  status: OrderStatus;
  lines: OrderLine[];
  /** Whole-order discount, 0–100 percent, applied after line discounts. */
  discountPercent: number;
  /** Before any discount. */
  subtotalKurus: Kurus;
  /** Line and order discounts together. */
  discountKurus: Kurus;
  totalKurus: Kurus;
  createdAt: Date;
  createdByMemberId: string;
  /** The client's key for "create", so a double tap makes one order. */
  createKey: string;
  paidAt: Date | null;
  paidByMemberId: string | null;
  paymentMethod: PaymentMethod | null;
  /** Cash handed over and change given back, when the barista entered it. */
  tenderedKurus: Kurus | null;
  changeKurus: Kurus | null;
  /** The client's key for "pay": a retry after a lost answer returns the same result. */
  payKey: string | null;
  voidedAt: Date | null;
  voidedByMemberId: string | null;
  voidReason: string | null;
  refundedAt: Date | null;
  refundedByMemberId: string | null;
  refundReason: string | null;
  refundKurus: Kurus | null;
  /** "Sil": hidden from lists and reports, kept for the record (Shelby erased the row). */
  deletedAt: Date | null;
  deletedByMemberId: string | null;
  deleteReason: string | null;
}

export const MAX_LINE_QUANTITY = 99;
export const MAX_ORDER_LINES = 100;
/** The till's quick discount buttons, as in Shelby. Any whole percent 0–100 works too. */
export const QUICK_DISCOUNTS = [5, 10, 15, 20, 25] as const;

/** Half-up to the kuruş. */
function percentOf(amount: Kurus, percent: number): Kurus {
  return Math.round((amount * percent) / 100);
}

export function lineTotal(line: Pick<OrderLine, "unitPriceKurus" | "quantity" | "discountPercent">): Kurus {
  const gross = line.unitPriceKurus * line.quantity;
  return gross - percentOf(gross, line.discountPercent);
}

/** Subtotal, discount and total for a set of lines and an order discount. */
export function orderTotals(lines: OrderLine[], discountPercent: number): { subtotalKurus: Kurus; discountKurus: Kurus; totalKurus: Kurus } {
  const subtotalKurus = lines.reduce((s, l) => s + l.unitPriceKurus * l.quantity, 0);
  const afterLines = lines.reduce((s, l) => s + lineTotal(l), 0);
  const totalKurus = afterLines - percentOf(afterLines, discountPercent);
  return { subtotalKurus, discountKurus: subtotalKurus - totalKurus, totalKurus };
}

export type OrderProblem = "ORDER_EMPTY" | "TOO_MANY_LINES" | "QUANTITY_INVALID" | "DISCOUNT_INVALID";

export function orderProblem(lines: { quantity: number; discountPercent: number }[], discountPercent: number): OrderProblem | null {
  if (lines.length === 0) return "ORDER_EMPTY";
  if (lines.length > MAX_ORDER_LINES) return "TOO_MANY_LINES";
  const percentOk = (p: number) => Number.isInteger(p) && p >= 0 && p <= 100;
  if (!percentOk(discountPercent) || lines.some((l) => !percentOk(l.discountPercent))) return "DISCOUNT_INVALID";
  if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > MAX_LINE_QUANTITY)) return "QUANTITY_INVALID";
  return null;
}

export interface OrderFilter {
  businessDay?: string;
  status?: OrderStatus;
  /** Newest first; defaults to 200. */
  limit?: number;
}

export interface OrderStore {
  /** The next number for that café and day: 1, 2, 3… Safe when two tills ask at once. */
  nextNumber(cafeId: string, businessDay: string): Promise<number>;
  /** Creates the order or replaces it, lines included. */
  saveOrder(order: Order): Promise<void>;
  getOrder(cafeId: string, id: string): Promise<Order | null>;
  findByCreateKey(cafeId: string, createKey: string): Promise<Order | null>;
  /** Newest first; deleted orders never. */
  listOrders(cafeId: string, filter?: OrderFilter): Promise<Order[]>;
}

export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();
  private readonly counters = new Map<string, number>();

  async nextNumber(cafeId: string, businessDay: string) {
    const key = `${cafeId}:${businessDay}`;
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async saveOrder(order: Order) {
    this.orders.set(order.id, clone(order));
  }

  async getOrder(cafeId: string, id: string) {
    const o = this.orders.get(id);
    return o && o.cafeId === cafeId ? clone(o) : null;
  }

  async findByCreateKey(cafeId: string, createKey: string) {
    const o = [...this.orders.values()].find((x) => x.cafeId === cafeId && x.createKey === createKey);
    return o ? clone(o) : null;
  }

  async listOrders(cafeId: string, filter: OrderFilter = {}) {
    return [...this.orders.values()]
      .filter(
        (o) =>
          o.cafeId === cafeId &&
          !o.deletedAt &&
          (!filter.businessDay || o.businessDay === filter.businessDay) &&
          (!filter.status || o.status === filter.status),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.number - a.number)
      .slice(0, filter.limit ?? 200)
      .map(clone);
  }
}

function clone(o: Order): Order {
  return { ...o, lines: o.lines.map((l) => ({ ...l })) };
}
