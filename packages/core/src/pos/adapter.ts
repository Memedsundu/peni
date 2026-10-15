import type { Kurus } from "../money";

/**
 * Peni does not take payments. Orders are paid at the café's till, and the till
 * belongs to a POS. A café on Shelby uses the Shelby adapter; a café without a
 * POS integration uses the standalone adapter, where staff mark orders paid in
 * the Peni café panel.
 */
export interface MenuItem {
  productId: string;
  name: string;
  category: string;
  priceKurus: Kurus;
  available: boolean;
  description?: string | null;
  imageUrl?: string | null;
}

export interface PendingOrderInput {
  cafeId: string;
  /** Peni's own order id. The POS stores it so its webhooks can refer back. */
  peniOrderId: string;
  customerDisplayName: string;
  lines: { productId: string; quantity: number; unitPriceKurus: Kurus; note?: string | null }[];
  customerNote: string | null;
  /** Covered by the customer's peni. The till charges the total minus this and minus `askidaKurus`. */
  peniDiscountKurus: Kurus;
  /** Covered by the café's askı pool. */
  askidaKurus: Kurus;
}

export interface PendingOrderRef {
  posOrderId: string;
  /** Short number the barista calls out, e.g. "A-042". */
  orderNumber: string;
}

/** Events the POS sends back to Peni. */
export type PosEvent =
  | {
      type: "order.paid";
      posOrderId: string;
      peniOrderId: string | null;
      /**
       * For walk-in orders not placed in the app: the member whose Peni code the till
       * scanned, so they still earn peni. (Phone digits are not used — they are not unique.)
       */
      membershipHint: { membershipId: string } | null;
      paidTotalKurus: Kurus;
      paidAt: string;
    }
  | { type: "order.refunded"; posOrderId: string; peniOrderId: string | null; refundedAt: string }
  | { type: "order.cancelled"; posOrderId: string; peniOrderId: string | null; cancelledAt: string };

export interface PosAdapter {
  readonly kind: "shelby" | "standalone";
  listMenu(cafeId: string): Promise<MenuItem[]>;
  /** False when the till is closed or staff paused app orders. */
  isAcceptingOrders(cafeId: string): Promise<boolean>;
  createPendingOrder(input: PendingOrderInput): Promise<PendingOrderRef>;
  cancelPendingOrder(posOrderId: string, reason: string): Promise<void>;
}
