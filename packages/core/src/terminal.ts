import type { ZReportProposal } from "./checks";
import type { Kurus } from "./money";
import { saleKdv } from "./menu";
import { lineTotal, type Order } from "./orders";
import { amountPaid, type Payment } from "./payments";

/**
 * The yazarkasa (N12). In Turkey every sale is registered on the café's fiscal device (ÖKC),
 * cash or card, and the device prints the fiscal receipt; a card is charged on the same
 * device. Penny runs in the cloud and can't reach a device on the café's network, so a small
 * program on the till computer, the bridge (`apps/till-bridge`), asks Penny for work and
 * drives the device. Penny keeps a job for everything the device is asked to do: a sale, a
 * refund, an X or Z report, a test slip. The bridge picks a job up, reports what the device
 * is doing and what it did, and the till waits for that answer.
 *
 * Only the bridge's driver speaks the device's own protocol: a practice yazarkasa today, the
 * Ingenico once its protocol documents arrive (D24). Everything here is the same for both.
 */

// ─────────────────────────────────────────────── settings

/** How the café's own reductions go on the fiscal receipt: off the total, or as a payment of the device's "other" kind. */
export type ReceiptTreatment = "discount" | "payment";

/** A till computer's yazarkasa, as the café set it up. */
export interface TerminalSettings {
  /**
   * The device's department (departman) for each KDV rate, by the rate: { "10": 2 }. The
   * device files every line under a department, and the technician set each one up with
   * its KDV; these numbers have to match that.
   */
  departments: Record<string, number>;
  /** Pennies spent on an order. A discount by default: they're the café's own loyalty, given back as money off. */
  peni: ReceiptTreatment;
  /**
   * What the askı paid for. A discount by default: whoever hung it paid for it on their own
   * receipt, so giving it out isn't takings a second time.
   */
  askida: ReceiptTreatment;
}

/** Penny's guess until the café checks it against the device. The mali müşavir confirms pennies and the askı. */
export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  departments: { "1": 1, "10": 2, "20": 3, "0": 4 },
  peni: "discount",
  askida: "discount",
};

/** Department numbers a device can have; ÖKCs number them from 1. */
export const MAX_DEPARTMENT = 99;

// ─────────────────────────────────────────────── what the device is asked to do

export interface FiscalLine {
  name: string;
  quantity: number;
  unitPriceKurus: Kurus;
  kdvPercent: number;
  department: number;
  /** The line's own discount. */
  discountKurus: Kurus;
  /** After the line's own discount. */
  totalKurus: Kurus;
}

export interface FiscalAdjustment {
  /** "order": the till's discount on the whole order. The rest: what was paid in other ways before the device's own payment. */
  kind: "order" | "peni" | "askida" | "cash" | "card";
  amountKurus: Kurus;
  /** Printed beside it: "İndirim %10", "Penny", "Askı". */
  label: string;
}

/** A sale as the yazarkasa should print it, and take its payment. */
export interface FiscalSale {
  /** Penny's reference for it: the payment's id. A device that keeps a reference of its own should keep this one. */
  ref: string;
  orderNumber: number;
  businessDay: string;
  /** The barista's first name, for the receipt's cashier line. */
  cashier: string;
  lines: FiscalLine[];
  /** Taken off the total, in this order: the till's discount, then pennies or the askı when they go as a discount. */
  discounts: FiscalAdjustment[];
  /** Paid already, printed as payments before the device's own. */
  paidBefore: FiscalAdjustment[];
  /** What the device takes now. For cash, what was handed over and the change, when the barista entered it. */
  take: { method: "cash" | "card"; amountKurus: Kurus; tenderedKurus: Kurus | null; changeKurus: Kurus | null };
}

/** Money going back on a sale the device recorded. */
export interface FiscalRefund {
  /** The refund payment's id. */
  ref: string;
  orderNumber: number;
  businessDay: string;
  cashier: string;
  method: "cash" | "card";
  amountKurus: Kurus;
  reason: string;
  lines: FiscalLine[];
  /** The sale it gives back, as the device recorded it. */
  original: { ref: string; receiptNo: string | null; terminal: TerminalData | null };
}

export type TerminalTask =
  | { kind: "sale"; sale: FiscalSale }
  | { kind: "refund"; refund: FiscalRefund }
  /** X: the day so far. Z: the day's closing report, which the law asks for every day. */
  | { kind: "report"; report: "x" | "z" }
  /** A slip that isn't a sale, to see the connection works. */
  | { kind: "test" };

export type TerminalTaskKind = TerminalTask["kind"];

// ─────────────────────────────────────────────── what the device answers

export interface FiscalReceiptInfo {
  /** Fiş no. */
  number: string | null;
  /** The Z report the receipt belongs to. */
  zNumber: string | null;
  /** The fiscal memory unit's number (EKÜ). */
  ekuNumber: string | null;
  /** The device's serial number (mali sicil no). */
  serial: string | null;
  /** When the device printed it, as it says. */
  printedAt: string | null;
}

export interface CardInfo {
  /** "Visa", "Mastercard", "Troy". */
  scheme: string | null;
  last4: string | null;
  bank: string | null;
  /** Provizyon / onay kodu. */
  authCode: string | null;
  /** The bank's own reference, needed to refund it later. */
  rrn: string | null;
}

/**
 * What the device did. "declined": the bank said no. "failed": the device couldn't do it
 * (paper out, not paired) and nothing was taken. "unknown": the device stopped answering
 * mid-way, so a person looks at what it printed and says.
 */
export type TerminalResult =
  | { outcome: "approved"; receipt?: FiscalReceiptInfo | null; card?: CardInfo | null; z?: ZReportProposal | null; message?: string | null }
  | { outcome: "declined"; code?: string | null; message: string }
  | { outcome: "failed"; code?: string | null; message: string }
  | { outcome: "cancelled"; message?: string | null }
  | { outcome: "unknown"; message: string };

/** Kept on a payment that went through the yazarkasa. */
export interface TerminalData {
  jobId: string;
  receipt: FiscalReceiptInfo | null;
  card: CardInfo | null;
  /** Set when the device couldn't answer and a person said what happened. */
  decidedByMemberId?: string | null;
}

/** What the device is doing, as the till shows it. Drivers may send their own words in a message too. */
export const TERMINAL_STAGES = ["waiting_card", "pin", "authorising", "printing", "cancelling"] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

// ─────────────────────────────────────────────── the bridge

export interface TerminalCapabilities {
  /** Cash and card sales with their fiscal receipt. */
  sale: boolean;
  /** Refunds: the bank's iade and the device's return document. */
  refund: boolean;
  /** X and Z reports. */
  reports: boolean;
  /** Stopping a card payment while the device waits for the card. */
  cancel: boolean;
}

/** What the bridge says about itself and its device, each time it checks in. */
export interface BridgeStatus {
  /** The bridge program's version. */
  version: string;
  /** "simulator" (the practice yazarkasa) or "ingenico". */
  driver: string;
  /** The device can take a sale right now. */
  ready: boolean;
  /** Why not, or a warning, in the device's words: "Kağıt bitti". */
  message: string | null;
  model: string | null;
  serial: string | null;
  capabilities: TerminalCapabilities;
}

/** The bridge on one till computer. Removing it and connecting again keeps the same record. */
export interface TillBridge {
  id: string;
  cafeId: string;
  deviceId: string;
  /** SHA-256 of the one-time code the bridge is connected with, until it is. */
  pairCodeHash: string | null;
  pairExpiresAt: Date | null;
  /** SHA-256 of the bridge's own token, once connected. */
  tokenHash: string | null;
  /** The computer's name, as the bridge reported it. */
  name: string | null;
  pairedAt: Date | null;
  lastSeenAt: Date | null;
  status: BridgeStatus | null;
  /** Off: the till takes payments by hand even while the bridge is connected. */
  enabled: boolean;
  settings: TerminalSettings;
  createdAt: Date;
  createdByMemberId: string;
  revokedAt: Date | null;
}

/**
 * "queued": waiting for the bridge. "sent": the bridge has it. "done": the bridge said what
 * the device did (even "unknown"). "cancelled": stopped before the bridge took it, or too
 * old to send.
 */
export type TerminalJobState = "queued" | "sent" | "done" | "cancelled";

export interface TerminalJob {
  id: string;
  cafeId: string;
  bridgeId: string;
  task: TerminalTask;
  /** The payment it takes or gives back. */
  paymentId: string | null;
  orderId: string | null;
  state: TerminalJobState;
  stage: TerminalStage | null;
  /** The device's own words about what it's doing. */
  message: string | null;
  cancelRequestedAt: Date | null;
  result: TerminalResult | null;
  /** A second answer that disagrees with the first (approved after a person said it wasn't), for someone to look at. */
  conflict: TerminalResult | null;
  createdAt: Date;
  createdByMemberId: string | null;
  sentAt: Date | null;
  /** When the bridge last said anything about it. */
  touchedAt: Date | null;
  finishedAt: Date | null;
}

/** The bridge checks in at least this often while it runs; longer and it's offline. */
export const BRIDGE_ONLINE_MS = 45_000;
/** A job the bridge has but hasn't spoken about for this long: the till offers to decide by hand. */
export const BRIDGE_SILENT_MS = 30_000;
/** A job nobody picked up in this long is never sent: a card sale mustn't appear on the device minutes later. */
export const JOB_QUEUE_MS = 90_000;
/** How long a code to connect a bridge works. */
export const PAIR_CODE_MS = 15 * 60_000;

export function bridgeOnline(bridge: Pick<TillBridge, "lastSeenAt" | "tokenHash" | "revokedAt">, now: Date): boolean {
  return !!bridge.tokenHash && !bridge.revokedAt && !!bridge.lastSeenAt && now.getTime() - bridge.lastSeenAt.getTime() < BRIDGE_ONLINE_MS;
}

/** Whether a till computer's new payment of this kind goes through its yazarkasa. */
export function bridgeTakes(bridge: TillBridge, payment: Pick<Payment, "kind" | "method">, now: Date): boolean {
  if (!bridge.enabled || !bridgeOnline(bridge, now) || !bridge.status?.ready) return false;
  if (payment.method !== "cash" && payment.method !== "card") return false;
  return payment.kind === "sale" ? bridge.status.capabilities.sale : bridge.status.capabilities.refund;
}

// ─────────────────────────────────────────────── building the receipt

const percentLabel = (p: number) => `İndirim %${p}`;

export function fiscalLines(order: Pick<Order, "lines">, settings: TerminalSettings): FiscalLine[] {
  return order.lines.map((l) => {
    const kdvPercent = saleKdv(l);
    const totalKurus = lineTotal(l);
    return {
      name: l.name,
      quantity: l.quantity,
      unitPriceKurus: l.unitPriceKurus,
      kdvPercent,
      department: departmentFor(settings, kdvPercent),
      discountKurus: l.unitPriceKurus * l.quantity - totalKurus,
      totalKurus,
    };
  });
}

export function departmentFor(settings: TerminalSettings, kdvPercent: number): number {
  const d = settings.departments[String(kdvPercent)];
  if (!d) throw new Error(`No department for KDV ${kdvPercent}`);
  return d;
}

/**
 * The receipt for the cash or card payment the device takes on an order: every line with its
 * KDV department, the till's discount, and whatever was paid before it (pennies, the askı),
 * as a discount or a payment as the café set up. What's printed always adds up to what the
 * device takes: lines, less discounts, less what was paid before.
 */
export function fiscalSale(input: { payment: Payment; order: Order; payments: Payment[]; settings: TerminalSettings; cashier: string }): FiscalSale {
  const { payment, order, payments, settings } = input;
  if (payment.method !== "cash" && payment.method !== "card") throw new Error("Only cash and card go through the yazarkasa");
  const lines = fiscalLines(order, settings);
  const linesKurus = lines.reduce((s, l) => s + l.totalKurus, 0);
  const discounts: FiscalAdjustment[] = [];
  const paidBefore: FiscalAdjustment[] = [];
  if (linesKurus > order.totalKurus) discounts.push({ kind: "order", amountKurus: linesKurus - order.totalKurus, label: percentLabel(order.discountPercent) });
  const others = payments.filter((p) => p.id !== payment.id);
  const by = (method: Payment["method"]) => amountPaid(others.filter((p) => p.method === method));
  for (const [kind, label, treatment] of [
    ["peni", "Penny", settings.peni],
    ["askida", "Askı", settings.askida],
  ] as const) {
    const amountKurus = by(kind);
    if (amountKurus > 0) (treatment === "discount" ? discounts : paidBefore).push({ kind, amountKurus, label });
  }
  for (const kind of ["cash", "card"] as const) {
    const amountKurus = by(kind);
    if (amountKurus > 0) paidBefore.push({ kind, amountKurus, label: kind === "cash" ? "Nakit" : "Kart" });
  }
  const sale: FiscalSale = {
    ref: payment.id,
    orderNumber: order.number,
    businessDay: order.businessDay,
    cashier: input.cashier,
    lines,
    discounts,
    paidBefore,
    take: { method: payment.method, amountKurus: payment.amountKurus, tenderedKurus: payment.tenderedKurus, changeKurus: payment.changeKurus },
  };
  if (fiscalDue(sale) !== payment.amountKurus) throw new Error(`The receipt for ${payment.id} doesn't add up`);
  return sale;
}

/** Lines, less discounts, less what was paid before: what the device should take. */
export function fiscalDue(sale: Pick<FiscalSale, "lines" | "discounts" | "paidBefore">): Kurus {
  const lines = sale.lines.reduce((s, l) => s + l.totalKurus, 0);
  const off = [...sale.discounts, ...sale.paidBefore].reduce((s, a) => s + a.amountKurus, 0);
  return lines - off;
}

/** A refund of a sale the device recorded. */
export function fiscalRefund(input: { refund: Payment; order: Order; sale: Payment | null; settings: TerminalSettings; cashier: string }): FiscalRefund {
  const { refund, order, sale } = input;
  if (refund.method !== "cash" && refund.method !== "card") throw new Error("Only cash and card go through the yazarkasa");
  return {
    ref: refund.id,
    orderNumber: order.number,
    businessDay: order.businessDay,
    cashier: input.cashier,
    method: refund.method,
    amountKurus: refund.amountKurus,
    reason: refund.reason ?? "",
    lines: fiscalLines(order, input.settings),
    original: { ref: sale?.id ?? "", receiptNo: sale?.receiptNo ?? null, terminal: sale?.terminalData ?? null },
  };
}

/** What's wrong with settings as entered, or null. */
export function terminalSettingsProblem(s: TerminalSettings): "DEPARTMENT_INVALID" | null {
  for (const rate of ["10", "1", "20", "0"]) {
    const d = s.departments[rate];
    if (!Number.isInteger(d) || d! < 1 || d! > MAX_DEPARTMENT) return "DEPARTMENT_INVALID";
  }
  return null;
}

// ─────────────────────────────────────────────── storage

/** What may change on a job once it's made. Each change is written on its own, so a cancel and a progress report never undo each other. */
export type TerminalJobChange = Partial<Pick<TerminalJob, "state" | "stage" | "message" | "cancelRequestedAt" | "result" | "conflict" | "sentAt" | "touchedAt" | "finishedAt">>;
export type TillBridgeChange = Partial<Omit<TillBridge, "id" | "cafeId" | "deviceId" | "createdAt" | "createdByMemberId">>;

export interface TerminalStore {
  /** Creates the bridge record or replaces it whole: connecting a computer, or again. */
  saveBridge(bridge: TillBridge): Promise<void>;
  updateBridge(id: string, change: TillBridgeChange): Promise<void>;
  getBridge(id: string): Promise<TillBridge | null>;
  /** The bridge record of a till computer, removed or not. */
  bridgeForDevice(deviceId: string): Promise<TillBridge | null>;
  bridgeForToken(tokenHash: string): Promise<TillBridge | null>;
  bridgeForPairCode(codeHash: string): Promise<TillBridge | null>;
  listBridges(cafeId: string): Promise<TillBridge[]>;

  /** Creates a job. */
  saveJob(job: TerminalJob): Promise<void>;
  /** Changes a job, only while it's in the state given when one is: false when it wasn't (another request moved it first). */
  updateJob(id: string, change: TerminalJobChange, onlyIn?: TerminalJobState): Promise<boolean>;
  getJob(id: string): Promise<TerminalJob | null>;
  jobForPayment(paymentId: string): Promise<TerminalJob | null>;
  /** The job the bridge has and hasn't answered yet, oldest first. */
  activeJob(bridgeId: string): Promise<TerminalJob | null>;
  /** Oldest first. */
  queuedJobs(bridgeId: string): Promise<TerminalJob[]>;
  /** Newest first. */
  listJobs(bridgeId: string, since: Date): Promise<TerminalJob[]>;
}

export class InMemoryTerminalStore implements TerminalStore {
  private readonly bridges = new Map<string, TillBridge>();
  private readonly jobs = new Map<string, TerminalJob>();

  async saveBridge(bridge: TillBridge) {
    this.bridges.set(bridge.id, structuredClone(bridge));
  }

  async updateBridge(id: string, change: TillBridgeChange) {
    const b = this.bridges.get(id);
    if (b) Object.assign(b, structuredClone(change));
  }

  async getBridge(id: string) {
    return this.copy(this.bridges.get(id));
  }

  async bridgeForDevice(deviceId: string) {
    return this.copy([...this.bridges.values()].find((b) => b.deviceId === deviceId));
  }

  async bridgeForToken(tokenHash: string) {
    return this.copy([...this.bridges.values()].find((b) => b.tokenHash === tokenHash));
  }

  async bridgeForPairCode(codeHash: string) {
    return this.copy([...this.bridges.values()].find((b) => b.pairCodeHash === codeHash));
  }

  async listBridges(cafeId: string) {
    return [...this.bridges.values()].filter((b) => b.cafeId === cafeId).map((b) => structuredClone(b));
  }

  async saveJob(job: TerminalJob) {
    this.jobs.set(job.id, structuredClone(job));
  }

  async updateJob(id: string, change: TerminalJobChange, onlyIn?: TerminalJobState) {
    const job = this.jobs.get(id);
    if (!job || (onlyIn && job.state !== onlyIn)) return false;
    Object.assign(job, structuredClone(change));
    return true;
  }

  async getJob(id: string) {
    return this.copy(this.jobs.get(id));
  }

  async jobForPayment(paymentId: string) {
    return this.copy([...this.jobs.values()].find((j) => j.paymentId === paymentId));
  }

  async activeJob(bridgeId: string) {
    return this.copy(this.byAge(bridgeId).find((j) => j.state === "sent"));
  }

  async queuedJobs(bridgeId: string) {
    return this.byAge(bridgeId)
      .filter((j) => j.state === "queued")
      .map((j) => structuredClone(j));
  }

  async listJobs(bridgeId: string, since: Date) {
    return this.byAge(bridgeId)
      .filter((j) => j.createdAt >= since)
      .reverse()
      .map((j) => structuredClone(j));
  }

  private byAge(bridgeId: string): TerminalJob[] {
    return [...this.jobs.values()].filter((j) => j.bridgeId === bridgeId).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  private copy<T>(x: T | undefined): T | null {
    return x ? structuredClone(x) : null;
  }
}
