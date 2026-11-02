import type {
  BridgeStatus,
  TerminalJob,
  TerminalJobChange,
  TerminalJobState,
  TerminalResult,
  TerminalSettings,
  TerminalStore,
  TerminalTask,
  TillBridge,
  TillBridgeChange,
} from "@peni/core";
import type { Db } from "./db";
import { Prisma, type TerminalJob as JobRow, type TillBridge as BridgeRow } from "./generated/client";

const json = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

function toBridge(r: BridgeRow): TillBridge {
  return { ...r, status: r.status as BridgeStatus | null, settings: r.settings as unknown as TerminalSettings };
}

function toJob({ kind: _kind, ...r }: JobRow): TerminalJob {
  return {
    ...r,
    task: r.task as unknown as TerminalTask,
    state: r.state as TerminalJob["state"],
    stage: r.stage as TerminalJob["stage"],
    result: r.result as TerminalResult | null,
    conflict: r.conflict as TerminalResult | null,
  };
}

export class PrismaTerminalStore implements TerminalStore {
  constructor(private readonly db: Db) {}

  async saveBridge(b: TillBridge): Promise<void> {
    const data = { ...b, status: json(b.status), settings: b.settings as unknown as Prisma.InputJsonValue };
    await this.db().tillBridge.upsert({ where: { id: b.id }, create: data, update: data });
  }

  async updateBridge(id: string, change: TillBridgeChange): Promise<void> {
    const { status, settings, ...rest } = change;
    await this.db().tillBridge.updateMany({
      where: { id },
      data: {
        ...rest,
        ...(status !== undefined ? { status: json(status) } : {}),
        ...(settings !== undefined ? { settings: settings as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async getBridge(id: string): Promise<TillBridge | null> {
    const r = await this.db().tillBridge.findUnique({ where: { id } });
    return r ? toBridge(r) : null;
  }

  async bridgeForDevice(deviceId: string): Promise<TillBridge | null> {
    const r = await this.db().tillBridge.findUnique({ where: { deviceId } });
    return r ? toBridge(r) : null;
  }

  async bridgeForToken(tokenHash: string): Promise<TillBridge | null> {
    const r = await this.db().tillBridge.findUnique({ where: { tokenHash } });
    return r ? toBridge(r) : null;
  }

  async bridgeForPairCode(codeHash: string): Promise<TillBridge | null> {
    const r = await this.db().tillBridge.findUnique({ where: { pairCodeHash: codeHash } });
    return r ? toBridge(r) : null;
  }

  async listBridges(cafeId: string): Promise<TillBridge[]> {
    return (await this.db().tillBridge.findMany({ where: { cafeId }, orderBy: { createdAt: "asc" } })).map(toBridge);
  }

  async saveJob(j: TerminalJob): Promise<void> {
    const data = {
      ...j,
      kind: j.task.kind,
      task: j.task as unknown as Prisma.InputJsonValue,
      result: json(j.result),
      conflict: json(j.conflict),
    };
    await this.db().terminalJob.upsert({ where: { id: j.id }, create: data, update: data });
  }

  async updateJob(id: string, change: TerminalJobChange, onlyIn?: TerminalJobState): Promise<boolean> {
    const { result, conflict, ...rest } = change;
    const { count } = await this.db().terminalJob.updateMany({
      where: { id, ...(onlyIn ? { state: onlyIn } : {}) },
      data: { ...rest, ...(result !== undefined ? { result: json(result) } : {}), ...(conflict !== undefined ? { conflict: json(conflict) } : {}) },
    });
    return count === 1;
  }

  async getJob(id: string): Promise<TerminalJob | null> {
    const r = await this.db().terminalJob.findUnique({ where: { id } });
    return r ? toJob(r) : null;
  }

  async jobForPayment(paymentId: string): Promise<TerminalJob | null> {
    const r = await this.db().terminalJob.findUnique({ where: { paymentId } });
    return r ? toJob(r) : null;
  }

  async activeJob(bridgeId: string): Promise<TerminalJob | null> {
    const r = await this.db().terminalJob.findFirst({ where: { bridgeId, state: "sent" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return r ? toJob(r) : null;
  }

  async queuedJobs(bridgeId: string): Promise<TerminalJob[]> {
    const rows = await this.db().terminalJob.findMany({ where: { bridgeId, state: "queued" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return rows.map(toJob);
  }

  async listJobs(bridgeId: string, since: Date): Promise<TerminalJob[]> {
    const rows = await this.db().terminalJob.findMany({ where: { bridgeId, createdAt: { gte: since } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return rows.map(toJob);
  }
}
