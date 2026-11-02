import { describe, expect, it } from "vitest";
import {
  bridgeTakes,
  BRIDGE_ONLINE_MS,
  DEFAULT_TERMINAL_SETTINGS,
  fiscalDue,
  fiscalRefund,
  fiscalSale,
  InMemoryTerminalStore,
  orderTotals,
  terminalSettingsProblem,
  type Order,
  type OrderLine,
  type Payment,
  type TerminalJob,
  type TillBridge,
} from "../src";

const at = new Date("2026-11-03T09:00:00Z");

const line = (name: string, unitPriceKurus: number, quantity: number, over: Partial<OrderLine> = {}): OrderLine => ({
  productId: name,
  name,
  unitPriceKurus,
  quantity,
  discountPercent: 0,
  ...over,
});

const order = (lines: OrderLine[], discountPercent = 0): Order => ({
  id: "ord_1",
  cafeId: "c1",
  number: 42,
  businessDay: "2026-11-03",
  status: "open",
  lines,
  discountPercent,
  ...orderTotals(lines, discountPercent),
  createdAt: at,
  createdByMemberId: "sm_ece",
  createKey: "k",
  paidAt: null,
  paidByMemberId: null,
  paymentMethod: null,
  tenderedKurus: null,
  changeKurus: null,
  voidedAt: null,
  voidedByMemberId: null,
  voidReason: null,
  refundedAt: null,
  refundedByMemberId: null,
  refundReason: null,
  refundKurus: null,
  deletedAt: null,
  deletedByMemberId: null,
  deleteReason: null,
});

let n = 0;
const payment = (method: Payment["method"], amountKurus: number, over: Partial<Payment> = {}): Payment => ({
  id: `pay_${++n}`,
  cafeId: "c1",
  orderId: "ord_1",
  kind: "sale",
  method,
  amountKurus,
  tenderedKurus: null,
  changeKurus: null,
  status: "approved",
  terminal: method === "peni" || method === "askida" ? method : "bridge",
  deviceId: "dev_1",
  cashSessionId: null,
  key: `k${n}`,
  reason: null,
  startedAt: at,
  startedByMemberId: "sm_ece",
  settledAt: at,
  settledByMemberId: null,
  reference: null,
  receiptNo: null,
  failure: null,
  ...over,
});

describe("the fiscal receipt (N12)", () => {
  it("files each line under its KDV's department, with its own discount", () => {
    const o = order([line("Latte", 9_000, 2, { discountPercent: 10 }), line("Kurabiye", 4_500, 1, { kdvPercent: 1 }), line("Çay", 3_000, 1)]);
    const card = payment("card", o.totalKurus, { status: "pending" });
    const sale = fiscalSale({ payment: card, order: o, payments: [card], settings: DEFAULT_TERMINAL_SETTINGS, cashier: "Ece" });
    expect(sale.lines).toEqual([
      { name: "Latte", quantity: 2, unitPriceKurus: 9_000, kdvPercent: 10, department: 2, discountKurus: 1_800, totalKurus: 16_200 },
      { name: "Kurabiye", quantity: 1, unitPriceKurus: 4_500, kdvPercent: 1, department: 1, discountKurus: 0, totalKurus: 4_500 },
      // A line from before KDV was kept on orders counts as 10.
      { name: "Çay", quantity: 1, unitPriceKurus: 3_000, kdvPercent: 10, department: 2, discountKurus: 0, totalKurus: 3_000 },
    ]);
    expect(sale).toMatchObject({ ref: card.id, orderNumber: 42, cashier: "Ece", discounts: [], paidBefore: [], take: { method: "card", amountKurus: 23_700 } });
  });

  it("takes the till's discount, pennies and the askı off the total, and always adds up to what the device takes", () => {
    const o = order([line("Latte", 9_000, 2), line("Çay", 3_000, 1)], 10); // ₺210, less 10% = ₺189
    const peni = payment("peni", 2_000);
    const askida = payment("askida", 3_000);
    const cash = payment("cash", o.totalKurus - 5_000, { status: "pending", tenderedKurus: 20_000, changeKurus: 6_100 });
    const sale = fiscalSale({ payment: cash, order: o, payments: [peni, askida, cash], settings: DEFAULT_TERMINAL_SETTINGS, cashier: "Ece" });
    expect(sale.discounts).toEqual([
      { kind: "order", amountKurus: 2_100, label: "İndirim %10" },
      { kind: "peni", amountKurus: 2_000, label: "Penny" },
      { kind: "askida", amountKurus: 3_000, label: "Askı" },
    ]);
    expect(sale.take).toEqual({ method: "cash", amountKurus: 13_900, tenderedKurus: 20_000, changeKurus: 6_100 });
    expect(fiscalDue(sale)).toBe(13_900);

    // Set up as payments instead, they print as payments before the cash; the total stays.
    const asPayments = fiscalSale({
      payment: cash,
      order: o,
      payments: [peni, askida, cash],
      settings: { ...DEFAULT_TERMINAL_SETTINGS, peni: "payment", askida: "payment" },
      cashier: "Ece",
    });
    expect(asPayments.discounts.map((d) => d.kind)).toEqual(["order"]);
    expect(asPayments.paidBefore.map((d) => d.kind)).toEqual(["peni", "askida"]);
    expect(fiscalDue(asPayments)).toBe(13_900);
  });

  it("counts pennies given back as not paid", () => {
    const o = order([line("Latte", 9_000, 1)]);
    const peni = payment("peni", 2_000);
    const back = payment("peni", 2_000, { kind: "refund" });
    const card = payment("card", 9_000, { status: "pending" });
    const sale = fiscalSale({ payment: card, order: o, payments: [peni, back, card], settings: DEFAULT_TERMINAL_SETTINGS, cashier: "Ece" });
    expect(sale.discounts).toEqual([]);
    expect(fiscalDue(sale)).toBe(9_000);
  });

  it("refuses a receipt that doesn't add up, or a rate with no department", () => {
    const o = order([line("Latte", 9_000, 1)]);
    const short = payment("card", 8_000, { status: "pending" });
    expect(() => fiscalSale({ payment: short, order: o, payments: [short], settings: DEFAULT_TERMINAL_SETTINGS, cashier: "Ece" })).toThrow(/add up/);
    const card = payment("card", 9_000, { status: "pending" });
    const none = { ...DEFAULT_TERMINAL_SETTINGS, departments: { "1": 1 } };
    expect(() => fiscalSale({ payment: card, order: o, payments: [card], settings: none, cashier: "Ece" })).toThrow(/department/);
    expect(terminalSettingsProblem(none)).toBe("DEPARTMENT_INVALID");
    expect(terminalSettingsProblem(DEFAULT_TERMINAL_SETTINGS)).toBeNull();
  });

  it("gives a refund the sale's receipt and card, so the device can find it", () => {
    const o = order([line("Latte", 9_000, 1)]);
    const sale = payment("card", 9_000, { receiptNo: "0042", terminalData: { jobId: "job_1", receipt: null, card: { scheme: "Visa", last4: "4242", bank: null, authCode: "123456", rrn: "R1" } } });
    const refund = payment("card", 9_000, { kind: "refund", status: "pending", reason: "Yanlış ürün" });
    expect(fiscalRefund({ refund, order: o, sale, settings: DEFAULT_TERMINAL_SETTINGS, cashier: "Murat" })).toMatchObject({
      ref: refund.id,
      method: "card",
      amountKurus: 9_000,
      reason: "Yanlış ürün",
      original: { ref: sale.id, receiptNo: "0042", terminal: { card: { rrn: "R1" } } },
    });
  });
});

describe("which payments go through the yazarkasa", () => {
  const bridge = (over: Partial<TillBridge> = {}): TillBridge => ({
    id: "brg_1",
    cafeId: "c1",
    deviceId: "dev_1",
    pairCodeHash: null,
    pairExpiresAt: null,
    tokenHash: "h",
    name: "KASA-PC",
    pairedAt: at,
    lastSeenAt: at,
    status: { version: "1", driver: "simulator", ready: true, message: null, model: null, serial: null, capabilities: { sale: true, refund: false, reports: true, cancel: true } },
    enabled: true,
    settings: DEFAULT_TERMINAL_SETTINGS,
    createdAt: at,
    createdByMemberId: "sm_leyla",
    revokedAt: null,
    ...over,
  });

  it("cash and card sales, while the bridge is online, on and ready", () => {
    expect(bridgeTakes(bridge(), { kind: "sale", method: "card" }, at)).toBe(true);
    expect(bridgeTakes(bridge(), { kind: "sale", method: "cash" }, at)).toBe(true);
    expect(bridgeTakes(bridge(), { kind: "sale", method: "peni" }, at)).toBe(false);
    // Refunds only when the driver can do them.
    expect(bridgeTakes(bridge(), { kind: "refund", method: "card" }, at)).toBe(false);
    expect(bridgeTakes(bridge({ enabled: false }), { kind: "sale", method: "card" }, at)).toBe(false);
    expect(bridgeTakes(bridge(), { kind: "sale", method: "card" }, new Date(at.getTime() + BRIDGE_ONLINE_MS))).toBe(false);
    expect(bridgeTakes(bridge({ status: { ...bridge().status!, ready: false, message: "Kağıt bitti" } }), { kind: "sale", method: "card" }, at)).toBe(false);
    expect(bridgeTakes(bridge({ revokedAt: at }), { kind: "sale", method: "card" }, at)).toBe(false);
  });
});

describe("the job list", () => {
  const job = (id: string, minutes: number): TerminalJob => ({
    id,
    cafeId: "c1",
    bridgeId: "brg_1",
    task: { kind: "test" },
    paymentId: null,
    orderId: null,
    state: "queued",
    stage: null,
    message: null,
    cancelRequestedAt: null,
    result: null,
    conflict: null,
    createdAt: new Date(at.getTime() + minutes * 60_000),
    createdByMemberId: null,
    sentAt: null,
    touchedAt: null,
    finishedAt: null,
  });

  it("hands each job out once, oldest first", async () => {
    const store = new InMemoryTerminalStore();
    await store.saveJob(job("b", 2));
    await store.saveJob(job("a", 1));
    expect((await store.queuedJobs("brg_1")).map((j) => j.id)).toEqual(["a", "b"]);
    expect(await store.updateJob("a", { state: "sent", sentAt: at }, "queued")).toBe(true);
    // Another poll asking at the same moment doesn't get it again.
    expect(await store.updateJob("a", { state: "sent", sentAt: at }, "queued")).toBe(false);
    expect((await store.activeJob("brg_1"))!.id).toBe("a");
    expect((await store.listJobs("brg_1", at)).map((j) => j.id)).toEqual(["b", "a"]);
  });
});
