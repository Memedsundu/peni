import type { FiscalSaleDTO, TerminalResultDTO, TerminalTaskDTO, ZReportDataDTO } from "@peni/api";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reportText, saleText } from "../receipt-text";
import type { DriverIO, DriverStatus, TerminalDriver } from "./types";

/**
 * The practice yazarkasa: it behaves like a device, so the whole path can be tried before the
 * real one is connected. Card sales wait for the card, the PIN and the bank; every slip is
 * printed on screen and kept in `receipts/`; receipt and Z numbers count up, and the Z report
 * adds up the day. Nothing it prints is fiscal.
 *
 * Some amounts misbehave on purpose, to try each case at the till:
 * - ending in ,13: the bank says no ("Yetersiz bakiye")
 * - ending in ,66: the device can't print ("Kağıt bitti"); nothing is taken
 * - ending in ,99: the device goes quiet, and the barista has to say what happened
 */
export interface SimulatorOptions {
  /** Where it keeps its numbers and its slips; null keeps them in memory. */
  dir: string | null;
  /** 1 is a real device's pace, 0 answers at once. */
  speed?: number;
  print?: (slip: string) => void;
  now?: () => Date;
  /** Pretends the paper ran out: it says it isn't ready. */
  paperOut?: boolean;
}

interface Day {
  date: string;
  receipts: number;
  totalKurus: number;
  cashKurus: number;
  cardKurus: number;
  otherKurus: number;
  /** KDV inside the day's sales, by rate. */
  kdv: Record<string, number>;
}

interface State {
  receiptNo: number;
  /** The Z report the day's receipts belong to. */
  zNo: number;
  day: Day;
  /** Its last answers by Penny's reference, as a device keeps its last transactions. */
  done: { ref: string; result: TerminalResultDTO }[];
}

const HEADER = ["PENNY DENEME YAZARKASASI", "Mali değeri yoktur"];
const SERIAL = "DENEME-0001";
const KEEP_DONE = 200;

export class SimulatorDriver implements TerminalDriver {
  readonly name = "simulator";
  private state: State;

  constructor(private readonly o: SimulatorOptions) {
    this.state = this.load();
  }

  async status(): Promise<DriverStatus> {
    return {
      ready: !this.o.paperOut,
      message: this.o.paperOut ? "Kağıt bitti" : null,
      model: "Penny deneme yazarkasası",
      serial: SERIAL,
      capabilities: { sale: true, refund: false, reports: true, cancel: true },
    };
  }

  async run(task: TerminalTaskDTO, io: DriverIO): Promise<TerminalResultDTO> {
    const result = await this.work(task, io);
    // Kept before it's said, as a device keeps its last transaction.
    this.state.done = [...this.state.done.filter((d) => d.ref !== io.ref), { ref: io.ref, result }].slice(-KEEP_DONE);
    this.save();
    return result;
  }

  async recover(ref: string): Promise<TerminalResultDTO | null> {
    return this.state.done.find((d) => d.ref === ref)?.result ?? null;
  }

  private async work(task: TerminalTaskDTO, io: DriverIO): Promise<TerminalResultDTO> {
    if (this.o.paperOut) return { outcome: "failed", code: "PAPER", message: "Kağıt bitti" };
    this.rollDay();
    switch (task.kind) {
      case "sale":
        return this.sale(task.sale, io);
      case "refund":
        return { outcome: "failed", code: "NOT_SUPPORTED", message: "Deneme yazarkasası iade yapmaz" };
      case "report":
        return this.report(task.report, io);
      case "test":
        io.progress("printing");
        await this.wait(800);
        this.print(["", ...HEADER, "", "DENEME FİŞİ", "Penny Köprü bağlantısı çalışıyor.", this.now().toLocaleString("tr-TR")].join("\n"));
        return { outcome: "approved", message: "Deneme fişi yazdırıldı" };
    }
  }

  private async sale(sale: FiscalSaleDTO, io: DriverIO): Promise<TerminalResultDTO> {
    const cents = sale.take.amountKurus % 100;
    let card: { scheme: string; last4: string; authCode: string } | null = null;
    if (sale.take.method === "card") {
      io.progress("waiting_card", "Kartı okutun");
      if (!(await this.wait(2_500, io.signal))) return { outcome: "cancelled", message: "Müşteri vazgeçti" };
      io.progress("pin", "Şifre bekleniyor");
      if (!(await this.wait(1_500, io.signal))) return { outcome: "cancelled", message: "Müşteri vazgeçti" };
      // From here a device can't stop: the bank has it.
      io.progress("authorising", "Banka onayı bekleniyor");
      await this.wait(1_500);
      if (cents === 13) return { outcome: "declined", code: "51", message: "Yetersiz bakiye" };
      if (cents === 99) {
        await this.wait(45_000);
        return { outcome: "unknown", message: "Cihaz cevap vermedi" };
      }
      card = { scheme: "Visa", last4: String(1000 + Math.floor(Math.random() * 9000)), authCode: String(100000 + Math.floor(Math.random() * 900000)) };
    }
    if (cents === 66) return { outcome: "failed", code: "PAPER", message: "Kağıt bitti" };
    io.progress("printing", "Fiş yazdırılıyor");
    await this.wait(1_000);

    const s = this.state;
    s.receiptNo += 1;
    const receiptNo = String(s.receiptNo).padStart(4, "0");
    const zNo = String(s.zNo).padStart(4, "0");
    const at = this.now();
    this.addToDay(sale);
    this.print(saleText(sale, { header: HEADER, receiptNo, zNo, at, card }), `${receiptNo}.txt`);
    return {
      outcome: "approved",
      receipt: { number: receiptNo, zNumber: zNo, ekuNumber: "1", serial: SERIAL, printedAt: at.toISOString() },
      card: card ? { scheme: card.scheme, last4: card.last4, bank: "Deneme Bankası", authCode: card.authCode, rrn: `RRN${Date.now()}` } : null,
    };
  }

  private async report(kind: "x" | "z", io: DriverIO): Promise<TerminalResultDTO> {
    io.progress("printing", kind === "z" ? "Z raporu yazdırılıyor" : "X raporu yazdırılıyor");
    await this.wait(1_500);
    const d = this.state.day;
    const z: ZReportDataDTO = {
      date: d.date,
      zNumber: String(this.state.zNo).padStart(4, "0"),
      totalKurus: d.totalKurus,
      cashKurus: d.cashKurus,
      cardKurus: d.cardKurus,
      otherKurus: d.otherKurus,
      receipts: d.receipts,
      refundsKurus: 0,
      kdv: Object.entries(d.kdv).map(([rate, amountKurus]) => ({ ratePct: Number(rate), amountKurus })),
    };
    this.print(reportText(kind, z, HEADER), `${kind}-${z.zNumber}.txt`);
    // Z closes the day: the next receipts belong to the next Z.
    if (kind === "z") {
      this.state.zNo += 1;
      this.state.day = emptyDay(d.date);
    }
    this.save();
    return { outcome: "approved", z, message: kind === "z" ? "Z raporu yazdırıldı" : "X raporu yazdırıldı" };
  }

  private addToDay(sale: FiscalSaleDTO): void {
    const d = this.state.day;
    const linesKurus = sale.lines.reduce((s, l) => s + l.totalKurus, 0);
    const totalKurus = linesKurus - sale.discounts.reduce((s, x) => s + x.amountKurus, 0);
    d.receipts += 1;
    d.totalKurus += totalKurus;
    for (const p of [...sale.paidBefore, { kind: sale.take.method, amountKurus: sale.take.amountKurus }]) {
      if (p.kind === "cash") d.cashKurus += p.amountKurus;
      else if (p.kind === "card") d.cardKurus += p.amountKurus;
      else d.otherKurus += p.amountKurus;
    }
    // KDV is inside the prices: each line's share of the total, after the receipt's discounts.
    for (const l of sale.lines) {
      const share = linesKurus > 0 ? (l.totalKurus * totalKurus) / linesKurus : 0;
      const key = String(l.kdvPercent);
      d.kdv[key] = (d.kdv[key] ?? 0) + Math.round((share * l.kdvPercent) / (100 + l.kdvPercent));
    }
  }

  /** A new calendar day without a Z: the device carries on with the same Z, as a real one would until it's taken. */
  private rollDay(): void {
    const today = localDay(this.now());
    if (this.state.day.date !== today && this.state.day.receipts === 0) this.state.day = emptyDay(today);
  }

  /** Waits like a device; false when the barista backed out meanwhile. */
  private async wait(ms: number, signal?: AbortSignal): Promise<boolean> {
    const total = ms * (this.o.speed ?? 1);
    if (signal?.aborted) return false;
    if (total <= 0) return true;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", stop);
        resolve(true);
      }, total);
      const stop = () => {
        clearTimeout(timer);
        resolve(false);
      };
      signal?.addEventListener("abort", stop, { once: true });
    });
  }

  private print(slip: string, file?: string): void {
    (this.o.print ?? ((s: string) => console.log(`\n${s}\n`)))(slip);
    if (!this.o.dir || !file) return;
    const folder = join(this.o.dir, "receipts", this.state.day.date);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, file), `${slip}\n`);
  }

  private now(): Date {
    return this.o.now?.() ?? new Date();
  }

  private load(): State {
    const fresh: State = { receiptNo: 0, zNo: 1, day: emptyDay(localDay(this.now())), done: [] };
    if (!this.o.dir) return fresh;
    try {
      return { ...fresh, ...(JSON.parse(readFileSync(join(this.o.dir, "simulator.json"), "utf8")) as State) };
    } catch {
      return fresh;
    }
  }

  private save(): void {
    if (!this.o.dir) return;
    mkdirSync(this.o.dir, { recursive: true });
    const file = join(this.o.dir, "simulator.json");
    writeFileSync(`${file}.tmp`, JSON.stringify(this.state));
    renameSync(`${file}.tmp`, file);
  }
}

function emptyDay(date: string): Day {
  return { date, receipts: 0, totalKurus: 0, cashKurus: 0, cardKurus: 0, otherKurus: 0, kdv: {} };
}

/** "2026-11-03" on this computer's own clock. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
