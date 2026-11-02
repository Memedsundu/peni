import type { BridgeJobDTO, BridgeStatusDTO, TerminalResultDTO } from "@peni/api";
import type { Stage, TerminalDriver } from "./drivers/types";
import type { Journal } from "./journal";
import { LinkError, type PennyLink } from "./link";

/** While the device works on a job, Penny hears from the bridge this often, so the till knows it's alive. */
const HEARTBEAT_MS = 5_000;
/** Waits between tries when Penny can't be reached: 1, 2, 4… seconds, at most this. */
const MAX_BACKOFF_MS = 30_000;

export interface RunnerOptions {
  link: PennyLink;
  driver: TerminalDriver;
  journal: Journal;
  /** This program's version, sent with its status. */
  version: string;
  log: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
  heartbeatMs?: number;
}

/**
 * Penny Köprü's loop: check in with Penny, take the next job, hand it to the device, say what
 * the device did. One job at a time, as the device does one thing at a time. Every job is in
 * the journal before the device sees it, and every answer until Penny has it: a power cut or
 * a lost connection never charges a card twice or loses a sale.
 */
export class Runner {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly o: RunnerOptions) {
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Runs until stopped, or until Penny says this bridge isn't connected any more. */
  async run(signal: AbortSignal): Promise<void> {
    let backoff = 1_000;
    while (!signal.aborted) {
      try {
        await this.once();
        backoff = 1_000;
      } catch (error) {
        if (error instanceof LinkError && error.status === 401) throw error;
        this.o.log(`Penny'ye ulaşılamadı (${message(error)}). ${backoff / 1000} sn sonra yeniden denenecek.`);
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  /** One round: answers still owed first, then one poll and its job. True when a job was handled. */
  async once(): Promise<boolean> {
    for (const owed of this.o.journal.unreported()) await this.report(owed.id, owed.result!);
    const answer = await this.o.link.poll(await this.status());
    if (answer.job) {
      await this.handle(answer.job);
      return true;
    }
    if (answer.waitMs > 0) await this.sleep(answer.waitMs);
    return false;
  }

  async status(): Promise<BridgeStatusDTO> {
    try {
      return { version: this.o.version, driver: this.o.driver.name, ...(await this.o.driver.status()) };
    } catch (error) {
      return {
        version: this.o.version,
        driver: this.o.driver.name,
        ready: false,
        message: `Cihaza ulaşılamadı: ${message(error)}`,
        model: null,
        serial: null,
        capabilities: { sale: false, refund: false, reports: false, cancel: false },
      };
    }
  }

  private async handle(job: BridgeJobDTO): Promise<void> {
    const known = this.o.journal.get(job.id);
    let result: TerminalResultDTO;
    if (known?.result) {
      // Done before; Penny just didn't hear.
      result = known.result;
    } else if (known?.startedAt) {
      // The computer stopped while the device had it: ask the device, never send it again.
      this.o.log(`İş ${job.id} yarıda kalmıştı; cihaza ne olduğu soruluyor.`);
      result = (await this.recover(job)) ?? { outcome: "unknown", message: "Köprü yeniden başladı; cihazın son fişine bakın." };
    } else if (job.cancel) {
      result = { outcome: "cancelled", message: null };
    } else {
      this.o.journal.started(job.id, job.task);
      result = await this.work(job);
    }
    this.o.journal.finished(job.id, result);
    this.o.log(`${describe(job)}: ${outcomeWords(result)}`);
    await this.report(job.id, result);
  }

  private async recover(job: BridgeJobDTO): Promise<TerminalResultDTO | null> {
    try {
      return await this.o.driver.recover(job.id, job.task);
    } catch {
      return null;
    }
  }

  /** The device does the job, telling the till what it's at; a "stop" from the barista reaches it through the signal. */
  private async work(job: BridgeJobDTO): Promise<TerminalResultDTO> {
    const stop = new AbortController();
    let stage: Stage | null = null;
    let words: string | null = null;
    const tell = async () => {
      try {
        const { cancel } = await this.o.link.progress(job.id, stage, words);
        if (cancel && !stop.signal.aborted) {
          this.o.log("Kasadan iptal istendi; cihaz durduruluyor.");
          stop.abort();
        }
      } catch {
        // A missed heartbeat is fine; the next one carries the same news.
      }
    };
    const heartbeat = setInterval(() => void tell(), this.o.heartbeatMs ?? HEARTBEAT_MS);
    try {
      return await this.o.driver.run(job.task, {
        progress: (s, m) => {
          stage = s;
          words = m ?? null;
          void tell();
        },
        signal: stop.signal,
        ref: job.id,
      });
    } catch (error) {
      // The device stopped answering mid-way: nobody can say whether money moved.
      return { outcome: "unknown", message: `Cihazla bağlantı koptu: ${message(error)}` };
    } finally {
      clearInterval(heartbeat);
    }
  }

  /** Says what the device did, again and again until Penny has it. */
  private async report(id: string, result: TerminalResultDTO): Promise<void> {
    let backoff = 1_000;
    for (;;) {
      try {
        await this.o.link.result(id, result);
        this.o.journal.reported(id);
        return;
      } catch (error) {
        if (error instanceof LinkError && error.status === 401) throw error;
        if (error instanceof LinkError && error.status === 404) {
          // Penny no longer knows it (the bridge was connected again): nothing to say it to.
          this.o.journal.reported(id);
          return;
        }
        this.o.log(`Sonuç Penny'ye gönderilemedi (${message(error)}); ${backoff / 1000} sn sonra yeniden.`);
        await this.sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }
}

function describe(job: BridgeJobDTO): string {
  const t = job.task;
  if (t.kind === "sale") return `Sipariş #${t.sale.orderNumber}, ${t.sale.take.method === "card" ? "kart" : "nakit"} ${(t.sale.take.amountKurus / 100).toFixed(2)} TL`;
  if (t.kind === "refund") return `İade, sipariş #${t.refund.orderNumber}`;
  if (t.kind === "report") return t.report === "z" ? "Z raporu" : "X raporu";
  return "Deneme fişi";
}

function outcomeWords(r: TerminalResultDTO): string {
  switch (r.outcome) {
    case "approved":
      return r.receipt?.number ? `onaylandı, fiş ${r.receipt.number}` : "tamam";
    case "declined":
      return `reddedildi (${r.message})`;
    case "failed":
      return `yapılamadı (${r.message})`;
    case "cancelled":
      return "iptal edildi";
    case "unknown":
      return `sonucu bilinmiyor (${r.message})`;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
