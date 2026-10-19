import { manualTerminal, type Payment, type PaymentTerminal, type PaymentTerminals } from "@peni/core";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;
let murat: StaffContext;

/** Stands in for the Ingenico behind the till bridge: it answers on its own, later. */
class FakeTerminal implements PaymentTerminal {
  readonly kind = "fake";
  sent: Payment[] = [];
  cancelled: string[] = [];
  reachable = true;
  confirmation() {
    return "terminal" as const;
  }
  async send(payment: Payment) {
    if (!this.reachable) throw new Error("no answer on COM3");
    this.sent.push(payment);
  }
  async cancel(payment: Payment) {
    this.cancelled.push(payment.id);
  }
}

let fake: FakeTerminal;
/** Which till computer has the fake terminal; every other one pays manually. */
let fakeOn: string | null;
const terminals: PaymentTerminals = { terminalFor: async (_cafeId, deviceId) => (deviceId && deviceId === fakeOn ? fake : manualTerminal) };

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const order = (ctx: StaffContext, lines: { productId: string; quantity: number }[]) => app.till.create(ctx, { createKey: key(), lines });
const latte = () => order(ece, [{ productId: "latte", quantity: 1 }]);

/** Ece at a till computer, signed in with her PIN. */
async function eceAtTill(name: string): Promise<StaffContext> {
  const registered = await app.staff.registerDevice(leyla, name);
  const memberId = (await app.staff.till(registered.token)).staff.find((s) => s.name === "Ece Tan")!.memberId;
  return app.staff.at((await app.staff.pinSignIn(registered.token, memberId, DEMO_STAFF.ece.pin)).token, "moda");
}

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  stores = inMemoryStores();
  fake = new FakeTerminal();
  fakeOn = null;
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, terminals }, stores);
  await seed(app);
  leyla = await at("leyla");
  murat = await at("murat");
  ece = await eceAtTill("Kasa");
  // Cash needs the drawer open (piece 9).
  await app.cash.open(ece, { key: "open-the-drawer", countKurus: 50_000 });
});

describe("payments through one interface (plan piece 8)", () => {
  describe("with the manual terminal (D24)", () => {
    it("takes cash at once and keeps a record of it", async () => {
      const o = await latte();
      const { payment, order: paid } = await app.till.pay(ece, o.id, { method: "cash", payKey: key(), tenderedKurus: 20_000 });
      expect(payment).toMatchObject({
        kind: "sale",
        method: "cash",
        status: "approved",
        amountKurus: 12_000,
        tenderedKurus: 20_000,
        changeKurus: 8_000,
        terminal: "manual",
        confirmBy: null,
        startedBy: "Ece Tan",
        settledBy: "Ece Tan",
      });
      expect(paid).toMatchObject({ status: "paid", paymentMethod: "cash", changeKurus: 8_000 });
      expect(paid.payments.map((p) => p.id)).toEqual([payment.id]);
      expect(paid.claim?.peni).toBe(6);
    });

    it("waits for the barista's tap on a card, and a retried tap changes nothing", async () => {
      const o = await latte();
      const payKey = key();
      const started = await app.till.pay(ece, o.id, { method: "card", payKey });
      expect(started.payment).toMatchObject({ method: "card", status: "pending", confirmBy: "staff" });
      expect(started.order).toMatchObject({ status: "open", paidAt: null, claim: null });
      expect((await app.till.pay(ece, o.id, { method: "card", payKey })).payment.id).toBe(started.payment.id);

      const done = await app.till.confirmPayment(ece, o.id, started.payment.id);
      expect(done.payment).toMatchObject({ status: "approved", confirmBy: null, settledBy: "Ece Tan" });
      expect(done.order).toMatchObject({ status: "paid", paymentMethod: "card", paidAt: now.toISOString() });
      expect(done.order.claim).not.toBeNull();
      expect((await app.till.confirmPayment(ece, o.id, started.payment.id)).payment.status).toBe("approved");
      expect(await code(app.till.cancelPayment(ece, o.id, started.payment.id))).toBe("PAYMENT_APPROVED");
    });

    it("keeps the order open when the barista backs out or the card is declined, and moves on to cash", async () => {
      const o = await latte();
      const first = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
      expect((await app.till.cancelPayment(ece, o.id, first.payment.id)).payment.status).toBe("cancelled");
      const second = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
      const declined = await app.till.cancelPayment(ece, o.id, second.payment.id, { declined: true });
      expect(declined.payment.status).toBe("declined");
      expect(declined.order.status).toBe("open");
      expect(await code(app.till.confirmPayment(ece, o.id, second.payment.id))).toBe("PAYMENT_NOT_PENDING");

      // The card sheet was left open when the customer chose cash: the card is dropped.
      const third = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
      const cash = await app.till.pay(ece, o.id, { method: "cash", payKey: key() });
      expect(cash.order.status).toBe("paid");
      expect(cash.order.payments.map((p) => [p.method, p.status])).toEqual([
        ["card", "cancelled"],
        ["card", "declined"],
        ["card", "cancelled"],
        ["cash", "approved"],
      ]);
      expect(await code(app.till.confirmPayment(ece, o.id, third.payment.id))).toBe("PAYMENT_NOT_PENDING");
    });

    it("drops a waiting card when the order changes or is voided", async () => {
      const o = await latte();
      const card = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
      const changed = await app.till.update(ece, o.id, { lines: [{ productId: "latte", quantity: 2 }] });
      expect(changed.payments[0]!.status).toBe("cancelled");
      expect(await code(app.till.confirmPayment(ece, o.id, card.payment.id))).toBe("PAYMENT_NOT_PENDING");
      await app.till.pay(ece, o.id, { method: "card", payKey: key() });
      expect((await app.till.void(murat, o.id, { reason: "Müşteri gitti" })).payments.map((p) => p.status)).toEqual(["cancelled", "cancelled"]);
    });

    it("records a refund at once, as a payment the other way with its reason", async () => {
      const o = await latte();
      await app.till.pay(ece, o.id, { method: "cash", payKey: key() });
      const refunded = await app.till.refund(murat, o.id, { reason: "Soğuk geldi" });
      expect(refunded.status).toBe("refunded");
      expect(refunded.payments[1]).toMatchObject({ kind: "refund", method: "cash", status: "approved", amountKurus: 12_000, reason: "Soğuk geldi", startedBy: "Murat Aksu" });
      expect((await app.till.list(murat)).summary).toMatchObject({ salesKurus: 0, refundedKurus: 12_000 });
    });

    it("keeps payments to their order and café", async () => {
      const a = await latte();
      const b = await latte();
      const payKey = key();
      const card = await app.till.pay(ece, a.id, { method: "card", payKey });
      expect(await code(app.till.pay(ece, b.id, { method: "card", payKey }))).toBe("PAY_KEY_REUSED");
      expect(await code(app.till.confirmPayment(ece, b.id, card.payment.id))).toBe("PAYMENT_NOT_FOUND");
      const tarik = await at("tarik", "kuzguncuk");
      expect(await code(app.till.payment(tarik, a.id, card.payment.id))).toBe("PAYMENT_NOT_FOUND");
    });
  });

  describe("with a terminal that answers itself, as the Ingenico will through the till bridge", () => {
    let atBridge: StaffContext;
    beforeEach(async () => {
      atBridge = await eceAtTill("Kasa 2");
      fakeOn = atBridge.deviceId;
    });

    it("sends card and cash to the terminal and waits for its answer, with no change to the till's calls", async () => {
      const o = await order(atBridge, [{ productId: "latte", quantity: 1 }]);
      const started = await app.till.pay(atBridge, o.id, { method: "card", payKey: key() });
      expect(started.payment).toMatchObject({ status: "pending", confirmBy: "terminal", terminal: "fake" });
      expect(fake.sent.map((p) => [p.id, p.amountKurus])).toEqual([[started.payment.id, 12_000]]);
      expect(await code(app.till.confirmPayment(atBridge, o.id, started.payment.id))).toBe("CONFIRMED_BY_TERMINAL");
      // The terminal is working on it: nothing else may take this order's money meanwhile.
      expect(await code(app.till.pay(atBridge, o.id, { method: "cash", payKey: key() }))).toBe("PAYMENT_IN_PROGRESS");
      expect(await code(app.till.void(await at("murat"), o.id, { reason: "x" }))).toBe("PAYMENT_IN_PROGRESS");

      await app.payments.settle("cafe_moda", started.payment.id, { approved: true, reference: "A1B2C3", receiptNo: "0042" });
      const checked = await app.till.payment(atBridge, o.id, started.payment.id);
      expect(checked.payment).toMatchObject({ status: "approved", settledBy: null, reference: "A1B2C3", receiptNo: "0042" });
      expect(checked.order.status).toBe("paid");
      expect(checked.order.claim).not.toBeNull();

      // Cash goes to the terminal too, for its fiscal receipt.
      const cashOrder = await order(atBridge, [{ productId: "cay", quantity: 1 }]);
      expect((await app.till.pay(atBridge, cashOrder.id, { method: "cash", payKey: key() })).payment.status).toBe("pending");
    });

    it("records a decline or an unreachable terminal, and tells the terminal when the barista backs out", async () => {
      const o = await order(atBridge, [{ productId: "latte", quantity: 1 }]);
      const first = await app.till.pay(atBridge, o.id, { method: "card", payKey: key() });
      await app.payments.settle("cafe_moda", first.payment.id, { approved: false, reason: "Yetersiz bakiye" });
      expect((await app.till.payment(atBridge, o.id, first.payment.id)).payment).toMatchObject({ status: "declined", failure: "Yetersiz bakiye" });
      expect(await code(app.payments.settle("cafe_moda", first.payment.id, { approved: true }))).toBe("PAYMENT_NOT_PENDING");

      const second = await app.till.pay(atBridge, o.id, { method: "card", payKey: key() });
      await app.till.cancelPayment(atBridge, o.id, second.payment.id);
      expect(fake.cancelled).toEqual([second.payment.id]);

      fake.reachable = false;
      const third = await app.till.pay(atBridge, o.id, { method: "card", payKey: key() });
      expect(third.payment).toMatchObject({ status: "declined", failure: "TERMINAL_UNREACHABLE" });
      expect(third.order.status).toBe("open");
    });

    it("refunds through the terminal too: the order stays paid until it answers", async () => {
      const o = await order(atBridge, [{ productId: "latte", quantity: 1 }]);
      const sale = await app.till.pay(atBridge, o.id, { method: "card", payKey: key() });
      await app.payments.settle("cafe_moda", sale.payment.id, { approved: true });
      await app.till.payment(atBridge, o.id, sale.payment.id); // the till shows the claim
      // The manager refunds at the same till computer.
      const managerAtBridge: StaffContext = { ...murat, deviceId: atBridge.deviceId };
      const waiting = await app.till.refund(managerAtBridge, o.id, { reason: "Yanlış ürün" });
      expect(waiting).toMatchObject({ status: "paid", canRefund: false });
      expect(waiting.payments[1]).toMatchObject({ kind: "refund", status: "pending", confirmBy: "terminal" });
      expect(await code(app.till.refund(managerAtBridge, o.id, { reason: "Yanlış ürün" }))).toBe("PAYMENT_IN_PROGRESS");

      await app.payments.settle("cafe_moda", waiting.payments[1]!.id, { approved: true });
      const refunded = await app.till.get(murat, o.id);
      expect(refunded).toMatchObject({ status: "refunded", refunded: { by: "Murat Aksu", reason: "Yanlış ürün", amountKurus: 12_000 } });
      expect((await stores.claims.getClaimByOrder("cafe_moda", o.id))!.cancelledAt).toEqual(now);
    });
  });
});
