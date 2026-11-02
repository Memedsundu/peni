import type { TerminalResultDTO, TerminalTaskDTO } from "@peni/api";
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** What the bridge knows about one job, kept on disk as it goes. */
export interface JournalEntry {
  id: string;
  task: TerminalTaskDTO;
  /** Written before the job goes to the device: after a restart, the device is asked what happened rather than told again. */
  startedAt: string | null;
  result: TerminalResultDTO | null;
  /** Penny took the answer. */
  reportedAt: string | null;
}

type Event =
  | { at: string; id: string; event: "started"; task: TerminalTaskDTO }
  | { at: string; id: string; event: "result"; result: TerminalResultDTO }
  | { at: string; id: string; event: "reported" };

/**
 * The bridge's memory, which a power cut doesn't lose: every job it sent to the device and
 * what the device said, until Penny has the answer. Without it, a restart in the middle of
 * a card payment could charge the card twice, or lose a sale the customer paid for.
 */
export class Journal {
  private readonly entries = new Map<string, JournalEntry>();

  /** `file` is a JSON-lines file; null keeps it in memory (tests). */
  constructor(private readonly file: string | null) {
    if (file) this.load(file);
  }

  get(id: string): JournalEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** Answers Penny hasn't taken yet, oldest first. */
  unreported(): JournalEntry[] {
    return [...this.entries.values()].filter((e) => e.result && !e.reportedAt);
  }

  started(id: string, task: TerminalTaskDTO): void {
    this.write({ at: new Date().toISOString(), id, event: "started", task });
  }

  finished(id: string, result: TerminalResultDTO): void {
    this.write({ at: new Date().toISOString(), id, event: "result", result });
  }

  reported(id: string): void {
    this.write({ at: new Date().toISOString(), id, event: "reported" });
  }

  private write(e: Event): void {
    this.apply(e);
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    // On disk before the device is touched: synced, not just handed to the operating system.
    const fd = openSync(this.file, "a");
    try {
      appendFileSync(fd, `${JSON.stringify(e)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private apply(e: Event): void {
    const entry = this.entries.get(e.id) ?? { id: e.id, task: e.event === "started" ? e.task : { kind: "test" }, startedAt: null, result: null, reportedAt: null };
    if (e.event === "started") Object.assign(entry, { task: e.task, startedAt: e.at });
    if (e.event === "result") entry.result = e.result;
    if (e.event === "reported") entry.reportedAt = e.at;
    this.entries.set(e.id, entry);
  }

  /** Reads what's there; a line half-written when the power went is skipped. Answered jobs older than a week are dropped. */
  private load(file: string): void {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      return;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        this.apply(JSON.parse(line) as Event);
      } catch {}
    }
    const weekAgo = Date.now() - 7 * 24 * 3_600_000;
    const keep = [...this.entries.values()].filter((e) => !e.reportedAt || Date.parse(e.reportedAt) > weekAgo);
    if (keep.length === this.entries.size) return;
    this.entries.clear();
    const lines: string[] = [];
    for (const e of keep) {
      this.entries.set(e.id, e);
      if (e.startedAt) lines.push(JSON.stringify({ at: e.startedAt, id: e.id, event: "started", task: e.task }));
      if (e.result) lines.push(JSON.stringify({ at: e.startedAt ?? new Date().toISOString(), id: e.id, event: "result", result: e.result }));
      if (e.reportedAt) lines.push(JSON.stringify({ at: e.reportedAt, id: e.id, event: "reported" }));
    }
    writeFileSync(file, lines.length ? `${lines.join("\n")}\n` : "");
  }
}
