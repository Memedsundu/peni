import {
  askidaTerminal,
  manualTerminal,
  peniTerminal,
  type Payment,
  type PaymentConfirmation,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStore,
  type PaymentTerminal,
  type PaymentTerminals,
  type TerminalOutcome,
} from "@peni/core";
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
  /** Peni: the wallet's membership. Askı: what it paid for (`askidaRef`). */
  reference?: string | null;
}

/**
 * The one way into payments (plan piece 8, D24). It keeps the payment records and talks
 * to the till's terminal; it knows nothing about orders. When a payment is approved,
 * by the barista or by the yazarkasa through the till bridge (N12), `onApproved` moves
 * its order on. The yazarkasa's answers come in through `settle`.
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
    const terminal = await this.terminalForNew(by.cafeId, by.deviceId, request);
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
      reference: request.reference ?? null,
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
      } catch (error) {
        console.error("payments: the terminal didn't take", payment.id, error);
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

  /**
   * The barista backs out of a payment still waiting, or records that the terminal said no.
   * A payment the yazarkasa is already working on stays pending: the device is asked to
   * stop, and its answer settles it (it may have gone through).
   */
  async cancel(by: PaymentActor, paymentId: string, input: { declined?: boolean } = {}): Promise<Payment> {
    const payment = await this.get(by.cafeId, paymentId);
    if (payment.status === "declined" || payment.status === "cancelled") return payment;
    if (payment.status === "approved") throw new AppError("PAYMENT_APPROVED", "This payment went through; refund the order instead", 409);
    if ((await this.confirmation(payment)) === "terminal" && (await this.terminalOf(payment).cancel(payment)) === "requested") return payment;
    return this.finish(payment, { status: input.declined ? "declined" : "cancelled", settledByMemberId: by.memberId });
  }

  /**
   * The yazarkasa's answer, through the till bridge, or a person's word when the device
   * couldn't give one (`by`). Only a payment still pending is settled: the bridge keeps an
   * answer that comes too late beside its job, for someone to look at.
   */
  async settle(cafeId: string, paymentId: string, outcome: TerminalOutcome, by: string | null = null): Promise<Payment> {
    const payment = await this.get(cafeId, paymentId);
    if (payment.status !== "pending") throw new AppError("PAYMENT_NOT_PENDING", "This payment is already settled", 409);
    return outcome.approved
      ? this.finish(payment, {
          status: "approved",
          reference: outcome.reference ?? null,
          receiptNo: outcome.receiptNo ?? null,
          terminalData: outcome.data ?? null,
          settledByMemberId: by,
        })
      : this.finish(payment, { status: outcome.cancelled ? "cancelled" : "declined", failure: outcome.reason, settledByMemberId: by });
  }

  /** What the yazarkasa printed, on a payment a person already said went through. Changes nothing else. */
  async attach(cafeId: string, paymentId: string, change: Pick<Payment, "receiptNo" | "reference" | "terminalData">): Promise<void> {
    const payment = await this.get(cafeId, paymentId);
    await this.store.savePayment({ ...payment, ...change });
  }

  /**
   * Before an order is changed, voided or paid another way: payments still waiting on it
   * are cancelled. One the yazarkasa hasn't picked up yet is taken back; one it's working
   * on can't be cut off from here (it's asked to stop), so that stops.
   */
  async clearPending(by: PaymentActor, orderId: string): Promise<void> {
    const pending = (await this.store.listPayments(by.cafeId, [orderId])).filter((p) => p.status === "pending");
    for (const p of pending) {
      if ((await this.confirmation(p)) === "terminal" && (await this.terminalOf(p).cancel(p)) === "requested") {
        throw new AppError("PAYMENT_IN_PROGRESS", "The terminal is taking a payment on this order", 409);
      }
    }
    for (const p of pending) await this.finish(p, { status: "cancelled", settledByMemberId: by.memberId });
  }

  /** How a pending payment gets settled, from the terminal it went through. */
  async confirmation(payment: Payment): Promise<PaymentConfirmation> {
    return this.terminalOf(payment).confirmation(payment);
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

  /** Peni and the askı never go near the card terminal: the wallet or the pool is their terminal. */
  private terminalForNew(cafeId: string, deviceId: string | null, p: Pick<Payment, "kind" | "method">): Promise<PaymentTerminal> {
    if (p.method === "peni") return Promise.resolve(peniTerminal);
    if (p.method === "askida") return Promise.resolve(askidaTerminal);
    return this.terminals.terminalFor(cafeId, deviceId, p);
  }

  /** The terminal a payment went through, whatever that computer uses now. */
  private terminalOf(payment: Payment): PaymentTerminal {
    if (payment.method === "peni") return peniTerminal;
    if (payment.method === "askida") return askidaTerminal;
    return this.terminals.byKind(payment.terminal) ?? manualTerminal;
  }

  private async finish(payment: Payment, change: Partial<Payment>): Promise<Payment> {
    const next: Payment = { ...payment, settledAt: this.now(), ...change };
    await this.store.savePayment(next);
    if (next.status === "approved") await this.onApproved(next);
    return next;
  }
}
