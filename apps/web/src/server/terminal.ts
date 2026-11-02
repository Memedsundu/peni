import type {
  BridgeCodeDTO,
  BridgeJobDTO,
  BridgePairedDTO,
  BridgePollDTO,
  BridgeProgressDTO,
  PaymentDeviceDTO,
  TerminalDeviceDTO,
  TerminalJobDTO,
  TerminalsPageDTO,
  TillTerminalDTO,
} from "@peni/api";
import {
  bridgeOnline,
  bridgeTakes,
  BRIDGE_SILENT_MS,
  DEFAULT_TERMINAL_SETTINGS,
  JOB_QUEUE_MS,
  manualTerminal,
  PAIR_CODE_MS,
  startOfLocalDay,
  terminalSettingsProblem,
  type BridgeStatus,
  type FiscalRefund,
  type FiscalSale,
  type IdentityStore,
  type Payment,
  type PaymentStore,
  type PaymentTerminal,
  type PaymentTerminals,
  type PeniDirectory,
  type StaffStore,
  type TerminalJob,
  type TerminalResult,
  type TerminalSettings,
  type TerminalStage,
  type TerminalStore,
  type TerminalTask,
  type TillBridge,
  type TillDevice,
  type ZReportProposal,
} from "@peni/core";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { PaymentService } from "./payments";
import { requirePermission, type StaffContext } from "./staff";

/** The bridge's own requests carry its token in this header. */
export const BRIDGE_HEADER = "x-penny-bridge-token";

/** How long a bridge's poll waits for work before answering "nothing". */
const POLL_WAIT_MS = 20_000;
/** How often a waiting poll looks for a new job. */
const POLL_CHECK_MS = 1_000;

/** Codes leave out 0/O and 1/I, so they can't be misread off the screen. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** On a payment's `failure`: the device couldn't do it (paper out, not paired); its words follow. */
export const DEVICE_FAILED = "TERMINAL_FAILED:";
/** On a payment's `failure`: the bridge didn't pick it up in time. */
export const TERMINAL_TIMEOUT = "TERMINAL_TIMEOUT";
/** On a payment's `failure`: the device couldn't say, and a person said it didn't go through. */
export const DECIDED_NOT_TAKEN = "DECIDED_NOT_TAKEN";

/**
 * The yazarkasa on each till computer (N12, see `@peni/core`'s terminal.ts). For the
 * panel: connecting a computer's bridge with a one-time code, its settings, X and Z
 * reports. For the till: which payments go through the device (`terminals`), what the
 * device is doing with one, and a person's word when it can't say. For the bridge:
 * its jobs, one at a time, and what the device did with each.
 */
export class TerminalService {
  /** Set by the app: the fiscal receipt for a cash or card sale the yazarkasa takes. */
  saleFor: (payment: Payment, settings: TerminalSettings) => Promise<FiscalSale> = async () => {
    throw new Error("No receipts yet");
  };
  /** Set by the app: the same for a refund. */
  refundFor: (payment: Payment, settings: TerminalSettings) => Promise<FiscalRefund> = async () => {
    throw new Error("No receipts yet");
  };
  /** Set by the app: a Z report the device printed, to check beside the till's own day. */
  onZReport: (cafeId: string, z: ZReportProposal) => Promise<void> = async () => {};

  constructor(
    private readonly d: {
      store: TerminalStore;
      staff: StaffStore;
      identity: IdentityStore;
      payments: PaymentService;
      paymentStore: PaymentStore;
      directory: PeniDirectory;
      now: () => Date;
      /** Tests make the poll answer at once. */
      pollWaitMs?: number;
    },
  ) {}

  /** For the payment service: the yazarkasa when the till computer's bridge can take the payment, else the manual terminal. */
  readonly terminals: PaymentTerminals = {
    terminalFor: async (cafeId, deviceId, payment) => {
      if (!deviceId) return manualTerminal;
      const bridge = await this.d.store.bridgeForDevice(deviceId);
      return bridge && bridge.cafeId === cafeId && bridgeTakes(bridge, payment, this.d.now()) ? this.device : manualTerminal;
    },
    byKind: (kind) => (kind === "bridge" ? this.device : kind === "manual" ? manualTerminal : null),
  };

  private readonly device: PaymentTerminal = {
    kind: "bridge",
    confirmation: () => "terminal",
    send: (payment) => this.queuePayment(payment),
    cancel: (payment) => this.cancelPayment(payment),
  };

  // ─────────────────────────────────────────────── payments

  private async queuePayment(payment: Payment): Promise<void> {
    const bridge = payment.deviceId ? await this.d.store.bridgeForDevice(payment.deviceId) : null;
    if (!bridge) throw new Error("No yazarkasa on this till computer");
    const task: TerminalTask =
      payment.kind === "sale" ? { kind: "sale", sale: await this.saleFor(payment, bridge.settings) } : { kind: "refund", refund: await this.refundFor(payment, bridge.settings) };
    await this.d.store.saveJob(this.newJob(bridge, task, payment.startedByMemberId, payment));
  }

  /** Nothing sent yet: it's over. Sent: the device is asked to stop, and its answer settles the payment. */
  private async cancelPayment(payment: Payment): Promise<"cancelled" | "requested"> {
    const job = await this.d.store.jobForPayment(payment.id);
    if (!job || job.state === "cancelled") return "cancelled";
    const now = this.d.now();
    if (job.state === "queued" && (await this.d.store.updateJob(job.id, { state: "cancelled", result: { outcome: "cancelled" }, finishedAt: now }, "queued"))) {
      return "cancelled";
    }
    if (!job.cancelRequestedAt) await this.d.store.updateJob(job.id, { cancelRequestedAt: now }, "sent");
    return "requested";
  }

  /** What the device is doing with a payment still pending, for the till's payment sheet. */
  async paymentState(payment: Payment): Promise<PaymentDeviceDTO | null> {
    if (payment.terminal !== "bridge" || payment.status !== "pending") return null;
    const job = await this.d.store.jobForPayment(payment.id);
    if (!job || (await this.expireIfOld(job))) return null;
    const bridge = await this.d.store.getBridge(job.bridgeId);
    return {
      queued: job.state === "queued",
      stage: job.cancelRequestedAt && job.state === "sent" ? "cancelling" : job.stage,
      message: job.message,
      cancelling: !!job.cancelRequestedAt,
      needsDecision: this.needsDecision(job, bridge),
    };
  }

  /**
   * The device stopped answering mid-way: the barista looks at what it printed (a slip
   * with "ONAYLANDI", or none) and says. A later answer from the device that disagrees is
   * kept beside the job for someone to look at.
   */
  async decide(ctx: StaffContext, payment: Payment, approved: boolean): Promise<Payment> {
    requirePermission(ctx, "till.use");
    if (payment.terminal !== "bridge" || payment.status !== "pending") throw new AppError("PAYMENT_NOT_PENDING", "This payment is already settled", 409);
    const job = await this.d.store.jobForPayment(payment.id);
    const bridge = job ? await this.d.store.getBridge(job.bridgeId) : null;
    if (!job || !this.needsDecision(job, bridge)) throw new AppError("TERMINAL_ANSWERS", "Wait for the yazarkasa's answer", 409);
    if (job.state === "sent") {
      await this.d.store.updateJob(job.id, { state: "done", result: { outcome: "unknown", message: "Cihaz cevap vermedi" }, finishedAt: this.d.now() }, "sent");
    }
    return this.d.payments.settle(
      ctx.cafe.id,
      payment.id,
      approved
        ? { approved: true, data: { jobId: job.id, receipt: null, card: null, decidedByMemberId: ctx.member.id } }
        : { approved: false, reason: DECIDED_NOT_TAKEN },
      ctx.member.id,
    );
  }

  private needsDecision(job: TerminalJob, bridge: TillBridge | null): boolean {
    if (job.state === "done") return job.result?.outcome === "unknown";
    if (job.state !== "sent") return false;
    const heard = Math.max(job.touchedAt?.getTime() ?? 0, bridge?.lastSeenAt?.getTime() ?? 0);
    return this.d.now().getTime() - heard > BRIDGE_SILENT_MS;
  }

  /** A job nobody picked up in time is never sent; its payment is declined, so the till can pay another way. */
  private async expireIfOld(job: TerminalJob): Promise<boolean> {
    const now = this.d.now();
    if (job.state !== "queued" || now.getTime() - job.createdAt.getTime() <= JOB_QUEUE_MS) return false;
    if (!(await this.d.store.updateJob(job.id, { state: "cancelled", result: { outcome: "cancelled", message: TERMINAL_TIMEOUT }, finishedAt: now }, "queued"))) return false;
    if (job.paymentId) {
      const payment = await this.d.payments.get(job.cafeId, job.paymentId);
      if (payment.status === "pending") await this.d.payments.settle(job.cafeId, payment.id, { approved: false, reason: TERMINAL_TIMEOUT });
    }
    return true;
  }

  // ─────────────────────────────────────────────── the bridge's side

  /** The bridge exchanges the code from the Cihazlar page for its own token, shown to it once. */
  async pair(input: { code: string; name: string }): Promise<BridgePairedDTO> {
    const bridge = await this.d.store.bridgeForPairCode(sha256(normalizeCode(input.code)));
    const now = this.d.now();
    const wrong = new AppError("PAIR_CODE_WRONG", "This code doesn't work; make a new one on the Cihazlar page", 404);
    if (!bridge || bridge.revokedAt || !bridge.pairExpiresAt || bridge.pairExpiresAt <= now) throw wrong;
    const device = await this.d.staff.getDevice(bridge.deviceId);
    const cafe = await this.d.identity.getCafe(bridge.cafeId);
    if (!device || device.revokedAt || !cafe) throw wrong;
    const token = randomBytes(32).toString("base64url");
    await this.d.store.updateBridge(bridge.id, { tokenHash: sha256(token), pairCodeHash: null, pairExpiresAt: null, pairedAt: now, lastSeenAt: now, name: input.name });
    return { token, cafe: { name: cafe.name }, device: { name: device.name } };
  }

  /** The bridge behind a token; its till computer must still be a till. */
  async bridgeFor(token: string | null): Promise<TillBridge> {
    const bridge = token ? await this.d.store.bridgeForToken(sha256(token)) : null;
    const device = bridge ? await this.d.staff.getDevice(bridge.deviceId) : null;
    if (!bridge || bridge.revokedAt || !device || device.revokedAt) {
      throw new AppError("BRIDGE_UNKNOWN", "This bridge isn't connected; connect it again from the Cihazlar page", 401);
    }
    return bridge;
  }

  /**
   * The bridge checks in with what it and the device are up to, and gets its next job: the
   * one it already has and hasn't answered (after a restart, it finds out what happened
   * to it first), or the oldest waiting. With none, it waits a while for one to come.
   */
  async poll(bridge: TillBridge, status: BridgeStatus): Promise<BridgePollDTO> {
    await this.d.store.updateBridge(bridge.id, { lastSeenAt: this.d.now(), status });
    const until = Date.now() + (this.d.pollWaitMs ?? POLL_WAIT_MS);
    for (;;) {
      const job = await this.next(bridge);
      if (job) return { job: bridgeJob(job), waitMs: 0 };
      if (Date.now() >= until) return { job: null, waitMs: 0 };
      await new Promise((r) => setTimeout(r, POLL_CHECK_MS));
    }
  }

  private async next(bridge: TillBridge): Promise<TerminalJob | null> {
    const active = await this.d.store.activeJob(bridge.id);
    if (active) return active;
    for (const job of await this.d.store.queuedJobs(bridge.id)) {
      if (await this.expireIfOld(job)) continue;
      const now = this.d.now();
      // Another poll at the same moment doesn't get it too.
      if (await this.d.store.updateJob(job.id, { state: "sent", sentAt: now, touchedAt: now }, "queued")) return { ...job, state: "sent", sentAt: now, touchedAt: now };
    }
    return null;
  }

  /** What the device is doing now, for the till. The answer says whether the barista backed out. */
  async progress(bridge: TillBridge, jobId: string, input: { stage: TerminalStage | null; message?: string | null }): Promise<BridgeProgressDTO> {
    const job = await this.ownJob(bridge, jobId);
    const now = this.d.now();
    await this.d.store.updateBridge(bridge.id, { lastSeenAt: now });
    if (job.state === "sent") await this.d.store.updateJob(job.id, { stage: input.stage, message: input.message ?? null, touchedAt: now }, "sent");
    return { cancel: !!job.cancelRequestedAt || job.state === "cancelled" };
  }

  /**
   * What the device did. The same answer twice (a retry after a lost reply) is fine. A real
   * answer after "unknown" settles what's still open; one that disagrees with what a person
   * already said is kept beside the job.
   */
  async result(bridge: TillBridge, jobId: string, result: TerminalResult): Promise<{ ok: true }> {
    const job = await this.ownJob(bridge, jobId);
    const now = this.d.now();
    await this.d.store.updateBridge(bridge.id, { lastSeenAt: now });
    if (job.state === "sent") {
      if (await this.d.store.updateJob(job.id, { state: "done", result, stage: null, finishedAt: now, touchedAt: now }, "sent")) {
        await this.apply(job, result);
        return { ok: true };
      }
      // A person decided at that very moment: read it again.
      return this.result(bridge, jobId, result);
    }
    if (job.state === "done" && job.result?.outcome === "unknown" && result.outcome !== "unknown") {
      await this.d.store.updateJob(job.id, { result, finishedAt: now }, "done");
      await this.apply(job, result);
      return { ok: true };
    }
    if (job.result?.outcome !== result.outcome) await this.d.store.updateJob(job.id, { conflict: result });
    return { ok: true };
  }

  private async apply(job: TerminalJob, result: TerminalResult): Promise<void> {
    if (job.paymentId) await this.settlePayment(job, result);
    if (job.task.kind === "report" && job.task.report === "z" && result.outcome === "approved" && result.z) {
      await this.onZReport(job.cafeId, { ...result.z, fromTerminal: true });
    }
  }

  private async settlePayment(job: TerminalJob, result: TerminalResult): Promise<void> {
    const payment = await this.d.payments.get(job.cafeId, job.paymentId!);
    const data = result.outcome === "approved" ? { jobId: job.id, receipt: result.receipt ?? null, card: result.card ?? null } : null;
    if (payment.status === "pending") {
      if (result.outcome === "approved") {
        await this.d.payments.settle(job.cafeId, payment.id, { approved: true, reference: result.card?.authCode ?? null, receiptNo: result.receipt?.number ?? null, data });
      } else if (result.outcome !== "unknown") {
        await this.d.payments.settle(job.cafeId, payment.id, { approved: false, reason: failureOf(result), cancelled: result.outcome === "cancelled" });
      }
      return;
    }
    // A person already said what happened.
    if (result.outcome === "unknown") return;
    if ((payment.status === "approved") === (result.outcome === "approved")) {
      if (data) {
        await this.d.payments.attach(job.cafeId, payment.id, {
          receiptNo: data.receipt?.number ?? payment.receiptNo,
          reference: data.card?.authCode ?? payment.reference,
          terminalData: { ...data, decidedByMemberId: payment.terminalData?.decidedByMemberId ?? null },
        });
      }
      return;
    }
    await this.d.store.updateJob(job.id, { conflict: result });
  }

  private async ownJob(bridge: TillBridge, jobId: string): Promise<TerminalJob> {
    const job = await this.d.store.getJob(jobId);
    if (!job || job.bridgeId !== bridge.id) throw new AppError("NOT_FOUND", "No such job", 404);
    return job;
  }

  // ─────────────────────────────────────────────── the panel's Cihazlar page

  /** The café's till computers with their yazarkasa, and today's cash and card sales on each. Needs "devices.manage". */
  async page(ctx: StaffContext): Promise<TerminalsPageDTO> {
    requirePermission(ctx, "devices.manage");
    const now = this.d.now();
    const dayStart = startOfLocalDay(now, (await this.d.directory.getSettings(ctx.cafe.id)).timeZone);
    const sales = (await this.d.paymentStore.listSettled(ctx.cafe.id, dayStart, new Date(now.getTime() + 1))).filter(
      (p) => p.kind === "sale" && (p.method === "cash" || p.method === "card"),
    );
    const devices: TerminalDeviceDTO[] = [];
    for (const device of await this.d.staff.listDevices(ctx.cafe.id)) {
      const mine = sales.filter((p) => p.deviceId === device.id);
      const manual = mine.filter((p) => p.terminal !== "bridge");
      const bridge = await this.d.store.bridgeForDevice(device.id);
      devices.push({
        id: device.id,
        name: device.name,
        createdIso: device.createdAt.toISOString(),
        lastSeenIso: device.lastSeenAt?.toISOString() ?? null,
        bridge: bridge && this.shown(bridge, now) ? await this.bridgeDTO(bridge, dayStart, now) : null,
        today: { printed: mine.length - manual.length, manual: manual.length, manualKurus: manual.reduce((s, p) => s + p.amountKurus, 0) },
      });
    }
    return { cafe: { slug: ctx.cafe.slug, name: ctx.cafe.name }, devices };
  }

  /** A one-time code for the bridge on this computer. Connecting again replaces the old connection. */
  async connect(ctx: StaffContext, deviceId: string): Promise<BridgeCodeDTO> {
    requirePermission(ctx, "devices.manage");
    const device = await this.tillDevice(ctx, deviceId);
    const now = this.d.now();
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const expires = new Date(now.getTime() + PAIR_CODE_MS);
    const fresh = { pairCodeHash: sha256(code), pairExpiresAt: expires, tokenHash: null, name: null, pairedAt: null, lastSeenAt: null, status: null, revokedAt: null };
    const existing = await this.d.store.bridgeForDevice(device.id);
    if (existing) {
      await this.dropQueued(existing);
      await this.d.store.saveBridge({ ...existing, ...fresh });
    } else {
      await this.d.store.saveBridge({
        id: `brg_${randomUUID()}`,
        cafeId: ctx.cafe.id,
        deviceId: device.id,
        ...fresh,
        enabled: true,
        settings: DEFAULT_TERMINAL_SETTINGS,
        createdAt: now,
        createdByMemberId: ctx.member.id,
      });
    }
    return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresIso: expires.toISOString(), page: await this.page(ctx) };
  }

  /** "Bağlantıyı kaldır": the bridge's token stops working; the till goes back to taking payments by hand. */
  async disconnect(ctx: StaffContext, deviceId: string): Promise<TerminalsPageDTO> {
    requirePermission(ctx, "devices.manage");
    await this.deviceRevoked((await this.tillDevice(ctx, deviceId)).id);
    return this.page(ctx);
  }

  /** When a till computer is removed, or its bridge disconnected. */
  async deviceRevoked(deviceId: string): Promise<void> {
    const bridge = await this.d.store.bridgeForDevice(deviceId);
    if (!bridge || bridge.revokedAt) return;
    await this.dropQueued(bridge);
    await this.d.store.updateBridge(bridge.id, { revokedAt: this.d.now(), tokenHash: null, pairCodeHash: null, pairExpiresAt: null });
  }

  /** Whether payments go through it, its departments, and how pennies and the askı show on the receipt. */
  async saveSettings(ctx: StaffContext, deviceId: string, input: TerminalSettings & { enabled: boolean }): Promise<TerminalsPageDTO> {
    requirePermission(ctx, "devices.manage");
    const bridge = await this.connected(ctx, deviceId);
    const settings: TerminalSettings = { departments: input.departments, peni: input.peni, askida: input.askida };
    const problem = terminalSettingsProblem(settings);
    if (problem) throw new AppError(problem, "Every KDV rate needs a department from 1 to 99", 400);
    await this.d.store.updateBridge(bridge.id, { enabled: input.enabled, settings });
    return this.page(ctx);
  }

  /** "Deneme fişi", "X raporu", "Z raporu" from the panel. */
  async task(ctx: StaffContext, deviceId: string, kind: "test" | "x" | "z"): Promise<TerminalJobDTO> {
    requirePermission(ctx, "devices.manage");
    return this.startTask(await this.connected(ctx, deviceId), ctx, kind);
  }

  async job(ctx: StaffContext, jobId: string): Promise<TerminalJobDTO> {
    requirePermission(ctx, "devices.manage");
    const job = await this.d.store.getJob(jobId);
    if (!job || job.cafeId !== ctx.cafe.id) throw new AppError("NOT_FOUND", "No such job", 404);
    return jobDTO(job);
  }

  // ─────────────────────────────────────────────── the till

  /** The yazarkasa of the till computer the barista is at. */
  async tillState(ctx: StaffContext): Promise<TillTerminalDTO> {
    requirePermission(ctx, "till.use");
    const bridge = ctx.deviceId ? await this.d.store.bridgeForDevice(ctx.deviceId) : null;
    if (!bridge || bridge.revokedAt || !bridge.tokenHash) return { connected: false, online: false, ready: false, enabled: false, message: null, reports: false };
    const online = bridgeOnline(bridge, this.d.now());
    return {
      connected: true,
      online,
      ready: online && !!bridge.status?.ready,
      enabled: bridge.enabled,
      message: online ? (bridge.status?.message ?? null) : null,
      reports: online && !!bridge.status?.capabilities.reports,
    };
  }

  /** An X or Z report from the till's Kasa view, at the end of the day. Needs "cash.drawer". */
  async tillReport(ctx: StaffContext, kind: "x" | "z"): Promise<TerminalJobDTO> {
    requirePermission(ctx, "cash.drawer");
    if (!ctx.deviceId) throw new AppError("NOT_A_TILL", "Do this at the till computer", 409);
    return this.startTask(await this.connected(ctx, ctx.deviceId), ctx, kind);
  }

  async tillJob(ctx: StaffContext, jobId: string): Promise<TerminalJobDTO> {
    requirePermission(ctx, "cash.drawer");
    const job = await this.d.store.getJob(jobId);
    const bridge = job ? await this.d.store.getBridge(job.bridgeId) : null;
    if (!job || !bridge || bridge.deviceId !== ctx.deviceId) throw new AppError("NOT_FOUND", "No such job", 404);
    return jobDTO(job);
  }

  // ─────────────────────────────────────────────── helpers

  private async startTask(bridge: TillBridge, ctx: StaffContext, kind: "test" | "x" | "z"): Promise<TerminalJobDTO> {
    if (!bridgeOnline(bridge, this.d.now())) throw new AppError("TERMINAL_OFFLINE", "The yazarkasa isn't answering", 409);
    if (kind !== "test" && !bridge.status?.capabilities.reports) throw new AppError("TERMINAL_CANT", "This yazarkasa can't print reports from Penny", 409);
    const job = this.newJob(bridge, kind === "test" ? { kind: "test" } : { kind: "report", report: kind }, ctx.member.id, null);
    await this.d.store.saveJob(job);
    return jobDTO(job);
  }

  private newJob(bridge: TillBridge, task: TerminalTask, by: string | null, payment: Payment | null): TerminalJob {
    return {
      id: `tjb_${randomUUID()}`,
      cafeId: bridge.cafeId,
      bridgeId: bridge.id,
      task,
      paymentId: payment?.id ?? null,
      orderId: payment?.orderId ?? null,
      state: "queued",
      stage: null,
      message: null,
      cancelRequestedAt: null,
      result: null,
      conflict: null,
      createdAt: this.d.now(),
      createdByMemberId: by,
      sentAt: null,
      touchedAt: null,
      finishedAt: null,
    };
  }

  /** Waiting jobs of a connection that's going away never go out; their payments are declined. */
  private async dropQueued(bridge: TillBridge): Promise<void> {
    const now = this.d.now();
    for (const job of await this.d.store.queuedJobs(bridge.id)) {
      if (!(await this.d.store.updateJob(job.id, { state: "cancelled", result: { outcome: "cancelled" }, finishedAt: now }, "queued")) || !job.paymentId) continue;
      const payment = await this.d.payments.get(job.cafeId, job.paymentId);
      if (payment.status === "pending") await this.d.payments.settle(job.cafeId, payment.id, { approved: false, reason: "TERMINAL_UNREACHABLE" });
    }
  }

  private async tillDevice(ctx: StaffContext, deviceId: string): Promise<TillDevice> {
    const device = await this.d.staff.getDevice(deviceId);
    if (!device || device.cafeId !== ctx.cafe.id || device.revokedAt) throw new AppError("NOT_FOUND", "No such device", 404);
    return device;
  }

  private async connected(ctx: StaffContext, deviceId: string): Promise<TillBridge> {
    const device = await this.tillDevice(ctx, deviceId);
    const bridge = await this.d.store.bridgeForDevice(device.id);
    if (!bridge || bridge.revokedAt || !bridge.tokenHash) throw new AppError("TERMINAL_NOT_CONNECTED", "No yazarkasa is connected to this computer", 409);
    return bridge;
  }

  /** A connection, or a code that still works. */
  private shown(bridge: TillBridge, now: Date): boolean {
    if (bridge.revokedAt) return false;
    return !!bridge.tokenHash || (!!bridge.pairExpiresAt && bridge.pairExpiresAt > now);
  }

  private async bridgeDTO(bridge: TillBridge, dayStart: Date, now: Date): Promise<NonNullable<TerminalDeviceDTO["bridge"]>> {
    const jobs = (await this.d.store.listJobs(bridge.id, dayStart)).filter((j) => j.task.kind === "report" || j.task.kind === "test").slice(0, 5);
    return {
      state: !bridge.tokenHash ? "waiting" : bridgeOnline(bridge, now) ? "online" : "offline",
      pairExpiresIso: bridge.tokenHash ? null : (bridge.pairExpiresAt?.toISOString() ?? null),
      name: bridge.name,
      lastSeenIso: bridge.lastSeenAt?.toISOString() ?? null,
      status: bridge.status,
      enabled: bridge.enabled,
      settings: bridge.settings,
      jobs: jobs.map(jobDTO),
    };
  }
}

function bridgeJob(job: TerminalJob): BridgeJobDTO {
  return { id: job.id, task: job.task, cancel: !!job.cancelRequestedAt, createdIso: job.createdAt.toISOString() };
}

function jobDTO(job: TerminalJob): TerminalJobDTO {
  const r = job.result;
  const z = r?.outcome === "approved" ? r.z : null;
  return {
    id: job.id,
    kind: job.task.kind,
    report: job.task.kind === "report" ? job.task.report : null,
    state: job.state,
    stage: job.stage,
    message: job.message,
    outcome: r?.outcome ?? null,
    resultMessage: r && "message" in r ? (r.message ?? null) : null,
    createdIso: job.createdAt.toISOString(),
    finishedIso: job.finishedAt?.toISOString() ?? null,
    z: z ? { zNumber: z.zNumber, totalKurus: z.totalKurus, cashKurus: z.cashKurus, cardKurus: z.cardKurus, receipts: z.receipts } : null,
  };
}

/** What goes on a declined payment's `failure`, for the till to say. */
function failureOf(result: Exclude<TerminalResult, { outcome: "approved" | "unknown" }>): string {
  if (result.outcome === "failed") return `${DEVICE_FAILED}${result.message}`;
  if (result.outcome === "cancelled") return "CANCELLED";
  return result.message || result.code || "DECLINED";
}

/** "abcd-efgh" and "ABCD EFGH" are the same code. */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
