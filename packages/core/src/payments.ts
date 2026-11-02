import type { Kurus } from "./money";
import type { PaymentMethod } from "./orders";
import type { TerminalData } from "./terminal";

/**
 * Payments (plan piece 8). Every sale and every refund at the till goes through one
 * interface, `PaymentTerminal`, and leaves one `Payment` record. Without a yazarkasa
 * connected, the terminal is the manual one: the barista runs the Ingenico on its own and
 * taps on the till once it approves (D24). A till computer whose bridge is connected
 * pays through the yazarkasa itself (N12, `terminal.ts`); the till and the records stay
 * as they are, only who says "approved" changes.
 */

export type PaymentKind = "sale" | "refund";
/**
 * "pending": handed to the terminal, waiting for an answer. Then exactly one of
 * "approved", "declined" (the terminal or the bank said no) or "cancelled" (the barista
 * backed out, or moved on to another way of paying).
 */
export type PaymentStatus = "pending" | "approved" | "declined" | "cancelled";

/**
 * Who says the money is in.
 * - "now": nothing to wait for, approved as it's recorded (cash in hand with the manual terminal).
 * - "staff": the barista taps once the terminal approves (a card with the manual terminal).
 * - "terminal": the terminal answers on its own, through the till bridge.
 */
export type PaymentConfirmation = "now" | "staff" | "terminal";

export interface Payment {
  id: string;
  cafeId: string;
  orderId: string;
  kind: PaymentKind;
  method: PaymentMethod;
  /** What this payment moves; for a refund, what goes back. Always positive. */
  amountKurus: Kurus;
  /** Cash handed over and change given back, when the barista entered it. */
  tenderedKurus: Kurus | null;
  changeKurus: Kurus | null;
  status: PaymentStatus;
  /** Which terminal took it: "manual", "bridge" (the yazarkasa, N12), "peni", "askida". */
  terminal: string;
  /** The till computer it was taken on, when it was a till. */
  deviceId: string | null;
  /** The drawer's session it was taken in, when one was open (piece 9). Cash always has one. */
  cashSessionId: string | null;
  /** The client's key: a retry after a lost answer finds this payment again. */
  key: string;
  /** A refund's reason. */
  reason: string | null;
  startedAt: Date;
  startedByMemberId: string;
  settledAt: Date | null;
  /** The barista who confirmed or backed out; empty when the terminal answered itself. */
  settledByMemberId: string | null;
  /** The terminal's approval code and fiscal receipt number, once it sends them. */
  reference: string | null;
  receiptNo: string | null;
  /** Why it was declined or cancelled, in the terminal's or the barista's words. */
  failure: string | null;
  /** What the yazarkasa printed and the card it read, for one that went through it. */
  terminalData?: TerminalData | null;
}

/** A terminal's answer to a payment it was sent. `cancelled`: it stopped because the barista asked. */
export type TerminalOutcome =
  | { approved: true; reference?: string | null; receiptNo?: string | null; data?: TerminalData | null }
  | { approved: false; reason: string; cancelled?: boolean };

/**
 * The one way money is taken or given back. A terminal receives each payment once,
 * says how it will be confirmed, and is told when the barista backs out of one still
 * waiting. Its answer comes back through the payment service's `settle`.
 */
export interface PaymentTerminal {
  /** Stored on each payment: "manual", later "ingenico". */
  readonly kind: string;
  confirmation(payment: Pick<Payment, "kind" | "method">): PaymentConfirmation;
  /** Hands the payment over. Throws when the terminal can't be reached; the payment is then declined. */
  send(payment: Payment): Promise<void>;
  /**
   * The barista backed out of a payment still waiting. "cancelled": nothing reached the
   * device, it's over. "requested": the device is on it and was asked to stop; its answer
   * settles the payment, which may still go through.
   */
  cancel(payment: Payment): Promise<"cancelled" | "requested">;
}

/**
 * Without the till bridge, Peni can't reach the terminal (D24). Cash is in the barista's
 * hand, so it counts at once; a card counts when the barista taps that the terminal
 * approved it. A refund is done on the terminal or from the drawer and recorded at once,
 * after the manager has confirmed it with a reason.
 */
export const manualTerminal: PaymentTerminal = {
  kind: "manual",
  confirmation: (p) => (p.kind === "sale" && p.method === "card" ? "staff" : "now"),
  send: async () => {},
  cancel: async () => "cancelled",
};

/**
 * Peni are paid from the customer's wallet, not on any terminal: the ledger takes them
 * before the payment is recorded, so it's approved as it's recorded. The payment's
 * `reference` is the wallet's membership.
 */
export const peniTerminal: PaymentTerminal = {
  kind: "peni",
  confirmation: () => "now",
  send: async () => {},
  cancel: async () => "cancelled",
};

/**
 * The askı pays for askı items given out at the till (plan piece 13): the pool is taken
 * from before the payment is recorded, so it's approved as it's recorded.
 */
export const askidaTerminal: PaymentTerminal = {
  kind: "askida",
  confirmation: () => "now",
  send: async () => {},
  cancel: async () => "cancelled",
};

/** Which terminal a till computer pays with. */
export interface PaymentTerminals {
  /** For a new payment on this till computer: its yazarkasa when that's connected and can take it, else manual. */
  terminalFor(cafeId: string, deviceId: string | null, payment: Pick<Payment, "kind" | "method">): Promise<PaymentTerminal>;
  /** For a payment already taken: the terminal it went through, by the kind stored on it. */
  byKind(kind: string): PaymentTerminal | null;
}

/** Every till pays manually: no till computer has its yazarkasa connected. */
export const manualTerminals: PaymentTerminals = { terminalFor: async () => manualTerminal, byKind: () => manualTerminal };

/** Approved sales minus approved refunds. */
export function amountPaid(payments: Pick<Payment, "kind" | "status" | "amountKurus">[]): Kurus {
  return payments.reduce((s, p) => (p.status !== "approved" ? s : p.kind === "sale" ? s + p.amountKurus : s - p.amountKurus), 0);
}

export interface PaymentStore {
  /**
   * Creates the payment, or updates it. A new payment whose key is already used at the
   * café is refused with `false`: the other one won a race, so find it by key.
   */
  savePayment(payment: Payment): Promise<boolean>;
  getPayment(cafeId: string, id: string): Promise<Payment | null>;
  findPaymentByKey(cafeId: string, key: string): Promise<Payment | null>;
  /** Oldest first. */
  listPayments(cafeId: string, orderIds: string[]): Promise<Payment[]>;
  /** Everything taken during a drawer session, oldest first. */
  listCashSessionPayments(cafeId: string, cashSessionId: string): Promise<Payment[]>;
  /** Approved payments settled from `from` until before `to`, oldest first: card sales into the bank, a month's sales (piece 20). */
  listSettled(cafeId: string, from: Date, to: Date): Promise<Payment[]>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly payments = new Map<string, Payment>();
  /** Café and client key → payment id, so a save doesn't look through every payment. */
  private readonly byKey = new Map<string, string>();

  async savePayment(payment: Payment) {
    const k = `${payment.cafeId} ${payment.key}`;
    const holder = this.byKey.get(k);
    if (holder !== undefined && holder !== payment.id) return false;
    this.byKey.set(k, payment.id);
    this.payments.set(payment.id, { ...payment });
    return true;
  }

  async getPayment(cafeId: string, id: string) {
    const p = this.payments.get(id);
    return p && p.cafeId === cafeId ? { ...p } : null;
  }

  async findPaymentByKey(cafeId: string, key: string) {
    const id = this.byKey.get(`${cafeId} ${key}`);
    const p = id === undefined ? undefined : this.payments.get(id);
    return p ? { ...p } : null;
  }

  async listPayments(cafeId: string, orderIds: string[]) {
    const ids = new Set(orderIds);
    return [...this.payments.values()]
      .filter((p) => p.cafeId === cafeId && ids.has(p.orderId))
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((p) => ({ ...p }));
  }

  async listCashSessionPayments(cafeId: string, cashSessionId: string) {
    return [...this.payments.values()]
      .filter((p) => p.cafeId === cafeId && p.cashSessionId === cashSessionId)
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .map((p) => ({ ...p }));
  }

  async listSettled(cafeId: string, from: Date, to: Date) {
    return [...this.payments.values()]
      .filter((p) => p.cafeId === cafeId && p.status === "approved" && p.settledAt && p.settledAt >= from && p.settledAt < to)
      .sort((a, b) => a.settledAt!.getTime() - b.settledAt!.getTime())
      .map((p) => ({ ...p }));
  }
}
