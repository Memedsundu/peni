import type { BridgeJobDTO } from "@peni/api";
import type { BridgeStatus, TerminalResult, TillBridge } from "@peni/core";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
const later = (ms: number) => {
  now = new Date(now.getTime() + ms);
};

const STATUS: BridgeStatus = {
  version: "1.0.0",
  driver: "simulator",
  ready: true,
  message: null,
  model: "Deneme yazarkasası",
  serial: "SIM-0001",
  capabilities: { sale: true, refund: false, reports: true, cancel: true },
};
const APPROVED: TerminalResult = {
  outcome: "approved",
  receipt: { number: "0042", zNumber: "0007", ekuNumber: "1", serial: "SIM-0001", printedAt: "2026-11-03T12:00:00" },
  card: { scheme: "Visa", last4: "4242", bank: "Deneme Bankası", authCode: "123456", rrn: "R1" },
};

/** The bridge as the program on the till computer works it: connect with a code, poll, report. */
class FakeBridge {
  token = "";
  bridge!: TillBridge;
  constructor(readonly deviceId: string) {}
  async connect(by: StaffContext) {
    const { code } = await app.yazarkasa.connect(by, this.deviceId);
    this.token = (await app.yazarkasa.pair({ code, name: "KASA-PC" })).token;
    await this.poll();
  }
  async poll(status = STATUS): Promise<BridgeJobDTO | null> {
    this.bridge = await app.yazarkasa.bridgeFor(this.token);
    return (await app.yazarkasa.poll(this.bridge, status)).job;
  }
  async progress(jobId: string, stage: "waiting_card" | "pin" | "printing" | null, message: string | null = null) {
    return app.yazarkasa.progress(await app.yazarkasa.bridgeFor(this.token), jobId, { stage, message });
  }
  async answer(jobId: string, result: TerminalResult) {
    return app.yazarkasa.result(await app.yazarkasa.bridgeFor(this.token), jobId, result);
  }
}

/** Ece at a till computer, signed in with her PIN. */
async function eceAtTill(name: string): Promise<StaffContext> {
  const registered = await app.staff.registerDevice(leyla, name);
  const memberId = (await app.staff.till(registered.token)).staff.find((s) => s.name === "Ece Tan")!.memberId;
  return app.staff.at((await app.staff.pinSignIn(registered.token, memberId, DEMO_STAFF.ece.pin)).token, "moda");
}

const latte = () => app.till.create(ece, { createKey: key(), lines: [{ productId: "latte", quantity: 1 }] });
let bridge: FakeBridge;

beforeEach(async () => {
  now = new Date("2026-11-03T09:00:00Z");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now, bridgePollWaitMs: 0 }, stores);
  await seed(app);
  leyla = await app.staff.at((await app.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
  ece = await eceAtTill("Kasa");
  await app.cash.open(ece, { key: "open-the-drawer", countKurus: 50_000 });
  bridge = new FakeBridge(ece.deviceId!);
});

describe("connecting a till computer's yazarkasa (N12)", () => {
  it("takes a one-time code from the Cihazlar page, then its own token", async () => {
    const { code: pairCode, page } = await app.yazarkasa.connect(leyla, ece.deviceId!);
    expect(pairCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(page.devices.find((d) => d.id === ece.deviceId)!.bridge).toMatchObject({ state: "waiting" });
    expect(await code(app.yazarkasa.pair({ code: "AAAA-AAAA", name: "x" }))).toBe("PAIR_CODE_WRONG");
    // Typed in lower case without the dash, it's the same code; used once, it's gone.
    const { token } = await app.yazarkasa.pair({ code: pairCode.toLowerCase().replace("-", ""), name: "KASA-PC" });
    expect(await code(app.yazarkasa.pair({ code: pairCode, name: "x" }))).toBe("PAIR_CODE_WRONG");
    expect(await code(app.yazarkasa.bridgeFor("not-a-token"))).toBe("BRIDGE_UNKNOWN");
    await app.yazarkasa.poll(await app.yazarkasa.bridgeFor(token), STATUS);

    const shown = (await app.yazarkasa.page(leyla)).devices.find((d) => d.id === ece.deviceId)!.bridge!;
    expect(shown).toMatchObject({ state: "online", name: "KASA-PC", enabled: true, status: { driver: "simulator", serial: "SIM-0001" } });
    expect(await app.yazarkasa.tillState(ece)).toEqual({ connected: true, online: true, ready: true, enabled: true, message: null, reports: true });
    // A barista can't see or change the Cihazlar page.
    expect(await code(app.yazarkasa.page(ece))).toBe("FORBIDDEN");
  });

  it("a code stops working after 15 minutes, and connecting again replaces the old bridge", async () => {
    const { code: first } = await app.yazarkasa.connect(leyla, ece.deviceId!);
    later(15 * 60_000);
    expect(await code(app.yazarkasa.pair({ code: first, name: "x" }))).toBe("PAIR_CODE_WRONG");
    await bridge.connect(leyla);
    const old = bridge.token;
    await bridge.connect(leyla);
    expect(await code(app.yazarkasa.bridgeFor(old))).toBe("BRIDGE_UNKNOWN");
  });

  it("goes with its till computer, or when disconnected", async () => {
    await bridge.connect(leyla);
    await app.yazarkasa.disconnect(leyla, ece.deviceId!);
    expect(await code(bridge.poll())).toBe("BRIDGE_UNKNOWN");
    expect(await app.yazarkasa.tillState(ece)).toMatchObject({ connected: false });
    await bridge.connect(leyla);
    await app.staff.revokeDevice(leyla, ece.deviceId!);
    expect(await code(bridge.poll())).toBe("BRIDGE_UNKNOWN");
  });
});

describe("payments through the yazarkasa", () => {
  beforeEach(() => bridge.connect(leyla));

  it("sends a card sale with its receipt, shows what the device is doing, and takes its answer", async () => {
    const o = await latte();
    const started = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    expect(started.payment).toMatchObject({ status: "pending", terminal: "bridge", confirmBy: "terminal", device: { queued: true, stage: null } });
    // Nothing to tap: the device answers.
    expect(await code(app.till.confirmPayment(ece, o.id, started.payment.id))).toBe("CONFIRMED_BY_TERMINAL");

    const job = (await bridge.poll())!;
    expect(job.task).toEqual({
      kind: "sale",
      sale: {
        ref: started.payment.id,
        orderNumber: o.number,
        businessDay: o.businessDay,
        cashier: "Ece",
        lines: [{ name: "Latte", quantity: 1, unitPriceKurus: 12_000, kdvPercent: 10, department: 2, discountKurus: 0, totalKurus: 12_000 }],
        discounts: [],
        paidBefore: [],
        take: { method: "card", amountKurus: 12_000, tenderedKurus: null, changeKurus: null },
      },
    });
    // The same job again until it's answered: a bridge that restarts finds out about it first.
    expect((await bridge.poll())!.id).toBe(job.id);

    await bridge.progress(job.id, "waiting_card", "Kartı okutun");
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment.device).toMatchObject({ queued: false, stage: "waiting_card", message: "Kartı okutun" });

    await bridge.answer(job.id, APPROVED);
    const paid = await app.till.payment(ece, o.id, started.payment.id);
    expect(paid.payment).toMatchObject({
      status: "approved",
      settledBy: null,
      reference: "123456",
      receiptNo: "0042",
      device: null,
      fiscal: { receiptNo: "0042", zNumber: "0007", card: "Visa •••• 4242", decidedByStaff: false },
    });
    expect(paid.order.status).toBe("paid");
    expect(paid.order.claim).not.toBeNull();
    // Saying it twice (the bridge didn't hear the first reply) changes nothing.
    await bridge.answer(job.id, APPROVED);
    expect(await bridge.poll()).toBeNull();
  });

  it("puts pennies and the till's discount on a cash receipt, which always adds up", async () => {
    const o = await app.till.create(ece, { createKey: key(), lines: [{ productId: "latte", quantity: 2 }], discountPercent: 10 });
    const spend = await app.spendCode((await app.identity.getCustomer("cus_ayse"))!, "moda");
    await app.till.usePeni(ece, o.id, { code: spend.code, peni: 20, payKey: key() });
    const started = await app.till.pay(ece, o.id, { method: "cash", payKey: key(), tenderedKurus: 20_000 });
    const job = (await bridge.poll())!;
    expect(job.task.kind === "sale" && job.task.sale).toMatchObject({
      discounts: [
        { kind: "order", amountKurus: 2_400, label: "İndirim %10" },
        { kind: "peni", amountKurus: 2_000, label: "Penny" },
      ],
      take: { method: "cash", amountKurus: 19_600, tenderedKurus: 20_000, changeKurus: 400 },
    });
    await bridge.answer(job.id, { outcome: "approved", receipt: { ...APPROVED.receipt!, number: "0043" }, card: null });
    expect((await app.till.payment(ece, o.id, started.payment.id)).order.status).toBe("paid");
  });

  it("records the bank's no and the device's own trouble, so the till can say which", async () => {
    const o = await latte();
    const first = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    await bridge.answer((await bridge.poll())!.id, { outcome: "declined", code: "51", message: "Yetersiz bakiye" });
    expect((await app.till.payment(ece, o.id, first.payment.id)).payment).toMatchObject({ status: "declined", failure: "Yetersiz bakiye" });

    const second = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    await bridge.answer((await bridge.poll())!.id, { outcome: "failed", code: "PAPER", message: "Kağıt bitti" });
    expect((await app.till.payment(ece, o.id, second.payment.id)).payment).toMatchObject({ status: "declined", failure: "TERMINAL_FAILED:Kağıt bitti" });
    expect((await app.till.get(ece, o.id)).status).toBe("open");
  });

  it("takes back a payment the bridge hasn't picked up, and asks the device to stop one it has", async () => {
    const o = await latte();
    const queued = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    expect((await app.till.cancelPayment(ece, o.id, queued.payment.id)).payment.status).toBe("cancelled");
    expect(await bridge.poll()).toBeNull();

    const sent = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    const job = (await bridge.poll())!;
    const backedOut = await app.till.cancelPayment(ece, o.id, sent.payment.id);
    expect(backedOut.payment).toMatchObject({ status: "pending", device: { cancelling: true, stage: "cancelling" } });
    // Paying another way waits for the device.
    expect(await code(app.till.pay(ece, o.id, { method: "cash", payKey: key() }))).toBe("PAYMENT_IN_PROGRESS");
    expect(await bridge.progress(job.id, "waiting_card")).toEqual({ cancel: true });
    await bridge.answer(job.id, { outcome: "cancelled" });
    expect((await app.till.payment(ece, o.id, sent.payment.id)).payment.status).toBe("cancelled");
    expect((await app.till.pay(ece, o.id, { method: "cash", payKey: key() })).payment.status).toBe("pending");
  });

  it("lets the barista say what happened when the device goes quiet, and keeps a late answer that disagrees", async () => {
    const o = await latte();
    const started = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    const job = (await bridge.poll())!;
    await bridge.progress(job.id, "pin");
    expect(await code(app.till.decidePayment(ece, o.id, started.payment.id, { approved: true }))).toBe("TERMINAL_ANSWERS");
    later(31_000);
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment.device).toMatchObject({ needsDecision: true });
    const decided = await app.till.decidePayment(ece, o.id, started.payment.id, { approved: false });
    expect(decided.payment).toMatchObject({ status: "declined", failure: "DECIDED_NOT_TAKEN", settledBy: "Ece Tan" });

    // The bridge comes back and says it went through after all: kept for someone to look at.
    await bridge.answer(job.id, APPROVED);
    expect((await stores.terminals.getJob(job.id))!.conflict).toMatchObject({ outcome: "approved" });
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment.status).toBe("declined");
  });

  it("waits for a person after an 'unknown', and takes the device's real answer when it comes", async () => {
    const o = await latte();
    const started = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    const job = (await bridge.poll())!;
    await bridge.answer(job.id, { outcome: "unknown", message: "Cihaz cevap vermedi" });
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment).toMatchObject({ status: "pending", device: { needsDecision: true } });
    // After a restart the bridge asked the device: it did go through.
    await bridge.answer(job.id, APPROVED);
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment).toMatchObject({ status: "approved", receiptNo: "0042" });

    // A person said yes first: the device's receipt is added to it.
    const next = await latte();
    const second = await app.till.pay(ece, next.id, { method: "card", payKey: key() });
    const job2 = (await bridge.poll())!;
    await bridge.answer(job2.id, { outcome: "unknown", message: "?" });
    expect((await app.till.decidePayment(ece, next.id, second.payment.id, { approved: true })).payment.fiscal).toMatchObject({ decidedByStaff: true, receiptNo: null });
    await bridge.answer(job2.id, { ...APPROVED, receipt: { ...APPROVED.receipt!, number: "0044" } });
    expect((await app.till.payment(ece, next.id, second.payment.id)).payment).toMatchObject({ receiptNo: "0044", fiscal: { decidedByStaff: true, receiptNo: "0044" } });
  });

  it("never sends a payment the bridge didn't pick up in time", async () => {
    const o = await latte();
    const started = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    later(91_000);
    // The bridge went quiet, so the till asks again and finds it declined.
    await app.till.payment(ece, o.id, started.payment.id);
    expect((await app.till.payment(ece, o.id, started.payment.id)).payment).toMatchObject({ status: "declined", failure: "TERMINAL_TIMEOUT" });
    expect(await bridge.poll()).toBeNull();
  });

  it("pays by hand while the bridge is offline, switched off or its device isn't ready", async () => {
    later(46_000);
    const manual = await app.till.pay(ece, (await latte()).id, { method: "card", payKey: key() });
    expect(manual.payment).toMatchObject({ terminal: "manual", confirmBy: "staff" });
    expect(await app.yazarkasa.tillState(ece)).toMatchObject({ connected: true, online: false });

    await bridge.poll({ ...STATUS, ready: false, message: "Kağıt bitti" });
    expect((await app.till.pay(ece, (await latte()).id, { method: "card", payKey: key() })).payment.terminal).toBe("manual");
    expect(await app.yazarkasa.tillState(ece)).toMatchObject({ online: true, ready: false, message: "Kağıt bitti" });

    await bridge.poll();
    const settings = (await app.yazarkasa.page(leyla)).devices.find((d) => d.id === ece.deviceId)!.bridge!.settings;
    await app.yazarkasa.saveSettings(leyla, ece.deviceId!, { ...settings, enabled: false });
    expect((await app.till.pay(ece, (await latte()).id, { method: "cash", payKey: key() })).payment).toMatchObject({ terminal: "manual", status: "approved" });
    const today = (await app.yazarkasa.page(leyla)).devices.find((d) => d.id === ece.deviceId)!.today;
    expect(today).toMatchObject({ printed: 0, manual: 1, manualKurus: 12_000 });
    // Every KDV rate needs its department.
    expect(await code(app.yazarkasa.saveSettings(leyla, ece.deviceId!, { ...settings, enabled: true, departments: { "10": 2 } }))).toBe("DEPARTMENT_INVALID");
  });
});

describe("reports", () => {
  beforeEach(() => bridge.connect(leyla));

  it("prints a Z report from the till, which waits in Taslaklar beside the till's day", async () => {
    const z = await app.yazarkasa.tillReport(ece, "z");
    expect(z).toMatchObject({ kind: "report", report: "z", state: "queued" });
    const job = (await bridge.poll())!;
    expect(job.task).toEqual({ kind: "report", report: "z" });
    await bridge.answer(job.id, {
      outcome: "approved",
      z: { date: "2026-11-03", zNumber: "0007", totalKurus: 12_000, cashKurus: 0, cardKurus: 12_000, otherKurus: 0, receipts: 1, refundsKurus: 0, kdv: [{ ratePct: 10, amountKurus: 1_091 }] },
    });
    expect(await app.yazarkasa.tillJob(ece, z.id)).toMatchObject({ state: "done", outcome: "approved", z: { zNumber: "0007", totalKurus: 12_000 } });
    const drafts = await stores.assistant.listDrafts("cafe_moda", { status: "open", limit: 10 });
    expect(drafts.find((d) => d.kind === "zreport")).toMatchObject({ documentId: null, proposal: { zNumber: "0007", fromTerminal: true } });
  });

  it("refuses a report while the yazarkasa is offline", async () => {
    later(46_000);
    expect(await code(app.yazarkasa.task(leyla, ece.deviceId!, "x"))).toBe("TERMINAL_OFFLINE");
    await bridge.poll();
    expect((await app.yazarkasa.task(leyla, ece.deviceId!, "test")).kind).toBe("test");
  });
});
