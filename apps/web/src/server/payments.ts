import type { Payment, PaymentConfirmation, PaymentKind, PaymentMethod, PaymentStore, PaymentTerminals, TerminalOutcome } from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";

/** Who is acting, and on which till computer. */
export interface PaymentActor {
  cafeId: string;
  memberId: string;
  deviceId: string | null;
}

export interface PaymentRequest {
  orderId: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amountKurus: number;
  tenderedKurus: number | null;
  changeKurus: number | null;
  key: string;
  reason: string | null;
  /** The open drawer session, when there is one. */
  cashSessionId: string | null;
}

/**
 * The one way into payments (plan piece 8, D24). It keeps the payment records and talks
 * to the till's terminal; it knows nothing about orders. When a payment is approved,
 * by the barista or by the terminal through the till bridge, `onApproved` moves its
 * order on. The till bridge will call `settle`; nothing else changes when it arrives.
 */
export class PaymentService {
  /** Set by the order service. */
  onApproved: (payment: Payment) => Promise<void> = async () => {};

  constructor(
    private readonly store: PaymentStore,
    private readonly terminals: PaymentTerminals,
    private readonly now: () => Date,
  ) {}

  /**
   * Hands a payment to the till's terminal. It comes back approved when there is nothing
   * to wait for, otherwise pending. The same key again returns the same payment.
   */
  async start(by: PaymentActor, request: PaymentRequest): Promise<Payment> {
    const existing = await this.store.findPaymentByKey(by.cafeId, request.key);
    if (existing) return existing;
    const terminal = await this.terminals.terminalFor(by.cafeId, by.deviceId);
    const now = this.now();
    const payment: Payment = {
      id: `pay_${randomUUID()}`,
      cafeId: by.cafeId,
      ...request,
      status: "pending",
      terminal: terminal.kind,
      deviceId: by.deviceId,
      startedAt: now,
      startedByMemberId: by.memberId,
      settledAt: null,
      settledByMemberId: null,
      reference: null,
      receiptNo: null,
      failure: null,
    };
    const confirmation = terminal.confirmation(payment);
    if (confirmation === "now") Object.assign(payment, { status: "approved", settledAt: now, settledByMemberId: by.memberId });
    // A double tap raced past the lookup above: answer with the one that was kept.
    if (!(await this.store.savePayment(payment))) return (await this.store.findPaymentByKey(by.cafeId, request.key))!;
    if (payment.status === "approved") {
      await this.onApproved(payment);
      return payment;
    }
    if (confirmation === "terminal") {
      try {
        await terminal.send(payment);
      } catch {
        return this.finish(payment, { status: "declined", failure: "TERMINAL_UNREACHABLE" });
      }
    }
    return payment;
  }

  /** The barista says the terminal approved it. Only for payments the terminal can't confirm itself. */
  async confirm(by: PaymentActor, paymentId: string): Promise<Payment> {
    const payment = await this.get(by.cafeId, paymentId);
    if (payment.status === "approved") return payment;
    if (payment.status !== "pending") throw new AppError("PAYMENT_NOT_PENDING", "This payment is already settled", 409);
    if ((await this.confirmation(payment)) === "terminal") throw new AppError("CONFIRMED_BY_TERMINAL", "The terminal confirms this payment itself", 409);
    return this.finish(payment, { status: "approved", settledByMemberId: by.memberId });
  }

  /** The barista backs out of a payment still waiting, or records that the terminal said no. */
  async cancel(by: PaymentActor, paymentId: string, input: { declined?: boolean } = {}): Promise<Payment> {
    const payment = await this.get(by.cafeId, paymentId);
    if (payment.status === "declined" || payment.status === "cancelled") return payment;
    if (payment.status === "approved") throw new AppError("PAYMENT_APPROVED", "This payment went through; refund the order instead", 409);
    if ((await this.confirmation(payment)) === "terminal") {
      await (await this.terminals.terminalFor(payment.cafeId, payment.deviceId)).cancel(payment);
    }
    return this.finish(payment, { status: input.declined ? "declined" : "cancelled", settledByMemberId: by.memberId });
  }

  /**
   * The terminal's answer, through the till bridge. Only a payment still pending is
   * settled; what to do with an approval that arrives after the barista backed out is
   * the bridge's to decide once the Ingenico's protocol is known.
   */
  async settle(cafeId: string, paymentId: string, outcome: TerminalOutcome): Promise<Payment> {
    const payment = await this.get(cafeId, paymentId);
    if (payment.status !== "pending") throw new AppError("PAYMENT_NOT_PENDING", "This payment is already settled", 409);
    return outcome.approved
      ? this.finish(payment, { status: "approved", reference: outcome.reference ?? null, receiptNo: outcome.receiptNo ?? null })
      : this.finish(payment, { status: "declined", failure: outcome.reason });
  }

  /**
   * Before an order is changed, voided or paid another way: payments still waiting on it
   * are cancelled. One a terminal is working on can't be cut off from here, so that stops.
   */
  async clearPending(by: PaymentActor, orderId: string): Promise<void> {
    const pending = (await this.store.listPayments(by.cafeId, [orderId])).filter((p) => p.status === "pending");
    for (const p of pending) {
      if ((await this.confirmation(p)) === "terminal") throw new AppError("PAYMENT_IN_PROGRESS", "The terminal is taking a payment on this order", 409);
    }
    for (const p of pending) await this.finish(p, { status: "cancelled", settledByMemberId: by.memberId });
  }

  /** How a pending payment gets settled, from the terminal of the computer it was taken on. */
  async confirmation(payment: Payment): Promise<PaymentConfirmation> {
    return (await this.terminals.terminalFor(payment.cafeId, payment.deviceId)).confirmation(payment);
  }

  async get(cafeId: string, paymentId: string): Promise<Payment> {
    const payment = await this.store.getPayment(cafeId, paymentId);
    if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "No such payment", 404);
    return payment;
  }

  findByKey(cafeId: string, key: string): Promise<Payment | null> {
    return this.store.findPaymentByKey(cafeId, key);
  }

  /** Oldest first. */
  list(cafeId: string, orderIds: string[]): Promise<Payment[]> {
    return orderIds.length ? this.store.listPayments(cafeId, orderIds) : Promise.resolve([]);
  }

  private async finish(payment: Payment, change: Partial<Payment>): Promise<Payment> {
    const next: Payment = { ...payment, settledAt: this.now(), ...change };
    await this.store.savePayment(next);
    if (next.status === "approved") await this.onApproved(next);
    return next;
  }
}
