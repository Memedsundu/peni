import type { BridgeJobDTO, BridgePollDTO, BridgeStatusDTO, FiscalSaleDTO, TerminalResultDTO } from "@peni/api";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SimulatorDriver } from "../src/drivers/simulator";
import type { Stage } from "../src/drivers/types";
import { Journal } from "../src/journal";
import { LinkError, type PennyLink } from "../src/link";
import { Runner } from "../src/runner";

const sale = (amountKurus: number, method: "cash" | "card" = "card"): FiscalSaleDTO => ({
  ref: "pay_1",
  orderNumber: 7,
  businessDay: "2026-11-03",
  cashier: "Ece",
  lines: [{ name: "Latte", quantity: 1, unitPriceKurus: amountKurus, kdvPercent: 10, department: 2, discountKurus: 0, totalKurus: amountKurus }],
  discounts: [],
  paidBefore: [],
  take: { method, amountKurus, tenderedKurus: null, changeKurus: null },
});
const job = (id: string, task: BridgeJobDTO["task"], cancel = false): BridgeJobDTO => ({ id, task, cancel, createdIso: "2026-11-03T09:00:00Z" });

/** Penny as the bridge sees it: jobs to hand out, and what it was told. */
class FakePenny implements PennyLink {
  jobs: BridgeJobDTO[] = [];
  statuses: BridgeStatusDTO[] = [];
  progress_: { id: string; stage: Stage | null }[] = [];
  results: { id: string; result: TerminalResultDTO }[] = [];
  /** The barista backed out of these. */
  cancelled = new Set<string>();
  /** The next answers fail, as on a lost connection. */
  failResults = 0;
  gone = false;

  async pair() {
    return { token: "t", cafe: { name: "Moda" }, device: { name: "Kasa" } };
  }
  async poll(status: BridgeStatusDTO): Promise<BridgePollDTO> {
    if (this.gone) throw new LinkError(401, "BRIDGE_UNKNOWN", "not connected");
    this.statuses.push(status);
    const next = this.jobs.shift() ?? null;
    return { job: next && { ...next, cancel: next.cancel || this.cancelled.has(next.id) }, waitMs: 0 };
  }
  async progress(id: string, stage: Stage | null) {
    this.progress_.push({ id, stage });
    return { cancel: this.cancelled.has(id) };
  }
  async result(id: string, result: TerminalResultDTO) {
    if (this.failResults > 0) {
      this.failResults -= 1;
      throw new Error("network");
    }
    this.results.push({ id, result });
    return { ok: true as const };
  }
}

function setup(opts: { dir?: string | null; speed?: number } = {}) {
  const penny = new FakePenny();
  const printed: string[] = [];
  const driver = new SimulatorDriver({ dir: opts.dir ?? null, speed: opts.speed ?? 0, print: (s) => printed.push(s) });
  const journal = new Journal(opts.dir ? join(opts.dir, "journal.jsonl") : null);
  const runner = new Runner({ link: penny, driver, journal, version: "test", log: () => {}, sleep: async () => {}, heartbeatMs: 5 });
  return { penny, driver, journal, runner, printed };
}

describe("Penny Köprü's loop (N12)", () => {
  it("checks in with the device's status, does a card sale and says what the device printed", async () => {
    const { penny, runner, printed } = setup();
    penny.jobs.push(job("tjb_1", { kind: "sale", sale: sale(12_000) }));
    expect(await runner.once()).toBe(true);
    expect(penny.statuses[0]).toMatchObject({ version: "test", driver: "simulator", ready: true, capabilities: { sale: true, reports: true } });
    expect(penny.progress_.map((p) => p.stage)).toEqual(expect.arrayContaining(["waiting_card", "pin", "authorising", "printing"]));
    expect(penny.results[0]).toMatchObject({ id: "tjb_1", result: { outcome: "approved", receipt: { number: "0001", zNumber: "0001" }, card: { scheme: "Visa" } } });
    expect(printed[0]).toContain("FİŞ NO: 0001");
    expect(printed[0]).toContain("Latte");
    expect(await runner.once()).toBe(false);
  });

  it("stops the device when the barista backs out while it waits for the card", async () => {
    const { penny, runner } = setup({ speed: 0.01 });
    penny.jobs.push(job("tjb_2", { kind: "sale", sale: sale(12_000) }));
    penny.cancelled.add("tjb_2");
    // Already asked before it started: the device never sees it.
    await runner.once();
    expect(penny.results[0]).toMatchObject({ id: "tjb_2", result: { outcome: "cancelled" } });
    expect(penny.progress_).toEqual([]);

    // Asked while the device waits: the heartbeat hears it and the device stops.
    const late = job("tjb_3", { kind: "sale", sale: sale(12_000) });
    penny.jobs.push(late);
    const asked = runner.once();
    await new Promise((r) => setTimeout(r, 5));
    penny.cancelled.add("tjb_3");
    await asked;
    expect(penny.results[1]).toMatchObject({ id: "tjb_3", result: { outcome: "cancelled" } });
  });

  it("says the bank's no, and the device's own trouble, as the practice amounts ask", async () => {
    const { penny, runner } = setup();
    penny.jobs.push(job("a", { kind: "sale", sale: sale(12_013) }), job("b", { kind: "sale", sale: sale(12_066, "cash") }));
    await runner.once();
    await runner.once();
    expect(penny.results.map((r) => r.result)).toMatchObject([
      { outcome: "declined", code: "51", message: "Yetersiz bakiye" },
      { outcome: "failed", message: "Kağıt bitti" },
    ]);
  });

  it("keeps an answer Penny didn't get, and says it before taking anything new", async () => {
    const { penny, runner, journal } = setup();
    penny.jobs.push(job("tjb_4", { kind: "sale", sale: sale(9_000, "cash") }));
    penny.failResults = 2;
    await runner.once();
    // It tried until Penny took it.
    expect(penny.results).toHaveLength(1);
    expect(journal.unreported()).toEqual([]);
  });

  it("after a restart mid-way, asks the device what happened instead of charging the card again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "penny-kopru-"));
    const first = setup({ dir });
    const card = job("tjb_5", { kind: "sale", sale: sale(12_000) });
    // The device approved it, then the power went before the bridge wrote the answer down.
    await first.driver.run(card.task, { progress: () => {}, signal: new AbortController().signal, ref: card.id });
    first.journal.started(card.id, card.task);

    const after = setup({ dir });
    after.penny.jobs.push(card);
    await after.runner.once();
    expect(after.penny.results[0]).toMatchObject({ id: "tjb_5", result: { outcome: "approved", receipt: { number: "0001" } } });
    expect(after.printed).toEqual([]);

    // A device that can't say: a person decides at the till.
    const lost = job("tjb_6", { kind: "sale", sale: sale(5_000) });
    after.journal.started(lost.id, lost.task);
    after.penny.jobs.push(lost);
    await after.runner.once();
    expect(after.penny.results[1]).toMatchObject({ id: "tjb_6", result: { outcome: "unknown" } });
    expect(readFileSync(join(dir, "journal.jsonl"), "utf8")).toContain("tjb_6");
  });

  it("adds up the day for the Z report, and starts the next Z after it", async () => {
    const { penny, runner, printed } = setup();
    penny.jobs.push(
      job("s1", { kind: "sale", sale: sale(12_000) }),
      job("s2", { kind: "sale", sale: { ...sale(3_000, "cash"), discounts: [{ kind: "peni", amountKurus: 1_000, label: "Penny" }], take: { method: "cash", amountKurus: 2_000, tenderedKurus: null, changeKurus: null } } }),
      job("z", { kind: "report", report: "z" }),
      job("s3", { kind: "sale", sale: sale(4_000, "cash") }),
    );
    for (let i = 0; i < 4; i++) await runner.once();
    expect(penny.results[2]!.result).toMatchObject({
      outcome: "approved",
      z: { zNumber: "0001", receipts: 2, totalKurus: 14_000, cashKurus: 2_000, cardKurus: 12_000, kdv: [{ ratePct: 10, amountKurus: 1_273 }] },
    });
    expect(printed[2]).toContain("Z RAPORU");
    expect(penny.results[3]!.result).toMatchObject({ receipt: { number: "0003", zNumber: "0002" } });
  });

  it("stops when Penny says this bridge isn't connected any more", async () => {
    const { penny, runner } = setup();
    penny.gone = true;
    await expect(runner.run(new AbortController().signal)).rejects.toMatchObject({ status: 401 });
  });
});
