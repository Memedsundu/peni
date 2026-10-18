import type { BillKdv } from "./bills";
import type { Kurus } from "./money";

/**
 * Checking Peni against what others recorded (plan piece 27, A5 and A6).
 *
 * A bank or credit card statement is read line by line, and each line is matched to what
 * Peni has: a bill paid by bank or card, a day's card sales reaching the bank (less the
 * bank's commission), wages, a transfer. What matches on neither side is listed, so the
 * owner sees what was never entered and what the bank never saw.
 *
 * A Z report is the fiscal device's end-of-day total. It is set beside the till's own
 * cash and card sales for that day, and any difference is shown.
 *
 * Both arrive as drafts on Taslaklar (D21): the assistant reads, a person looks and says
 * it's checked. Nothing is added or changed by matching; the one thing a person can choose
 * to do is set Peni's bank balance to what the statement says.
 */

// ─────────────────────────────────────────────── statements

/** A bank account's statement, or a credit card's. */
export type StatementAccount = "bank" | "card";

/** What a line looks like it is, from its description: shown for lines Peni doesn't have. */
export type StatementGuess =
  | "cardSales"
  | "supplier"
  | "wages"
  | "tax"
  | "rent"
  | "utilities"
  | "fee"
  | "cardPayment"
  | "transfer"
  | "cash"
  | "loan"
  | "check"
  | "other";

export const STATEMENT_GUESSES: readonly StatementGuess[] = [
  "cardSales",
  "supplier",
  "wages",
  "tax",
  "rent",
  "utilities",
  "fee",
  "cardPayment",
  "transfer",
  "cash",
  "loan",
  "check",
  "other",
];

export interface StatementLine {
  /** "YYYY-MM-DD", the day the bank booked it. */
  date: string;
  description: string;
  /** From the café's side: in is positive (a deposit, a payment to the card), out negative. */
  amountKurus: Kurus;
  /** The balance after it, when the statement prints one. */
  balanceKurus: Kurus | null;
  guess: StatementGuess;
}

/** A statement as read. */
export interface StatementProposal {
  account: StatementAccount;
  bankName: string | null;
  /** The last digits of the card or account, as printed. */
  accountHint: string | null;
  from: string | null;
  to: string | null;
  /** Bank: the balance before the first line. Card: what the previous statement asked for. */
  openingKurus: Kurus | null;
  /** Bank: the balance after the last line. Card: what this statement asks for (dönem borcu). */
  closingKurus: Kurus | null;
  lines: StatementLine[];
}

/** One of Peni's own records a statement line can be: a payment, a movement, a day's card sales. */
export interface StatementRecord {
  id: string;
  day: string;
  /** From the account's side, like a statement line: in positive, out negative. */
  amountKurus: Kurus;
  /** What it is, in Nakit ve banka's words ("bill", "sales", "wages"…), or "charge" for a card spend. */
  kind: string;
  label: string | null;
  billId: string | null;
}

/** What a line was matched to. Card sales may be several days paid in one go. */
export interface StatementMatch {
  recordIds: string[];
  kind: string;
  label: string | null;
  /** The record's day; the last one for several days of sales. */
  day: string;
  /** What Peni has, which for card sales is more than reached the bank. */
  amountKurus: Kurus;
  billId: string | null;
  /** The bank's commission on card sales: what Peni has less what came in. */
  feeKurus: Kurus;
}

/** Days a bank may book a payment before or after the day Peni has it on. */
export const MATCH_DAYS_BEFORE = 3;
export const MATCH_DAYS_AFTER = 5;
/** Card sales reach the bank this many days later at most, less a commission of at most this share. */
export const SALES_DAYS = 4;
export const SALES_FEE_MAX_BPS = 500;
/** At most this many days of card sales are paid in one line (a weekend). */
export const SALES_RUN_MAX = 4;

/**
 * Pairs each statement line with one of Peni's records, each record used once. A line
 * matches a record of the same amount within a few days; a deposit on a bank statement
 * may also be one or a few days' card sales less the bank's commission. The closest days
 * win. Returns a match (or null) per line, and the records nothing matched.
 */
export function matchStatement(
  lines: readonly Pick<StatementLine, "date" | "amountKurus">[],
  records: readonly StatementRecord[],
  account: StatementAccount,
): { matches: (StatementMatch | null)[]; unmatched: StatementRecord[] } {
  const matches: (StatementMatch | null)[] = lines.map(() => null);
  const used = new Set<string>();

  // Same amount, closest day first.
  const pairs: { line: number; record: number; distance: number }[] = [];
  lines.forEach((l, i) =>
    records.forEach((r, j) => {
      if (r.amountKurus !== l.amountKurus || r.amountKurus === 0) return;
      const after = dayDiff(r.day, l.date);
      if (after < -MATCH_DAYS_BEFORE || after > MATCH_DAYS_AFTER) return;
      pairs.push({ line: i, record: j, distance: Math.abs(after) });
    }),
  );
  pairs.sort((a, b) => a.distance - b.distance || a.line - b.line || a.record - b.record);
  for (const p of pairs) {
    const r = records[p.record]!;
    if (matches[p.line] || used.has(r.id)) continue;
    used.add(r.id);
    matches[p.line] = { recordIds: [r.id], kind: r.kind, label: r.label, day: r.day, amountKurus: r.amountKurus, billId: r.billId, feeKurus: 0 };
  }

  // A bank's deposit of card sales: a day, or a run of days, less a commission.
  if (account === "bank") {
    const sales = records.filter((r) => r.kind === "sales" && r.amountKurus > 0).sort((a, b) => a.day.localeCompare(b.day));
    const order = lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.date.localeCompare(b.l.date) || a.i - b.i);
    for (const { l, i } of order) {
      if (matches[i] || l.amountKurus <= 0) continue;
      const free = sales.filter((s) => !used.has(s.id));
      let best: { run: StatementRecord[]; score: number } | null = null;
      for (let start = 0; start < free.length; start++) {
        const run: StatementRecord[] = [];
        for (let k = start; k < free.length && run.length < SALES_RUN_MAX; k++) {
          // A run is days next to each other among those with card sales.
          if (run.length && dayDiff(run.at(-1)!.day, free[k]!.day) > 3) break;
          run.push(free[k]!);
          const lag = dayDiff(free[k]!.day, l.date);
          if (lag < 0 || lag > SALES_DAYS) continue;
          const total = run.reduce((s, r) => s + r.amountKurus, 0);
          const fee = total - l.amountKurus;
          if (fee < 0 || fee * 10_000 > total * SALES_FEE_MAX_BPS) continue;
          // Fewer days, then sooner, then the smaller commission.
          const score = run.length * 1_000_000 + lag * 10_000 + Math.round((fee * 10_000) / total);
          if (!best || score < best.score) best = { run: [...run], score };
        }
      }
      if (!best) continue;
      const total = best.run.reduce((s, r) => s + r.amountKurus, 0);
      for (const r of best.run) used.add(r.id);
      matches[i] = {
        recordIds: best.run.map((r) => r.id),
        kind: "sales",
        label: null,
        day: best.run.at(-1)!.day,
        amountKurus: total,
        billId: null,
        feeKurus: total - l.amountKurus,
      };
    }
  }

  return { matches, unmatched: records.filter((r) => !used.has(r.id)) };
}

/** Days from `a` to `b`: positive when `b` is later. */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

// ─────────────────────────────────────────────── Z reports

/** A Z report as read from the fiscal device's print. */
export interface ZReportProposal {
  date: string | null;
  zNumber: string | null;
  /** Genel toplam: everything sold that day, KDV included. */
  totalKurus: Kurus | null;
  cashKurus: Kurus | null;
  cardKurus: Kurus | null;
  /** Paid any other way (meal cards and the like), which the till doesn't take. */
  otherKurus: Kurus | null;
  /** Fiş sayısı. */
  receipts: number | null;
  /** Returns, when printed. */
  refundsKurus: Kurus | null;
  kdv: BillKdv[];
}

/** What the till took on a day, by how it was paid, refunds taken off. */
export interface TillDay {
  cashKurus: Kurus;
  cardKurus: Kurus;
  peniKurus: Kurus;
  askiKurus: Kurus;
  /** Sales paid by cash or card: about one fiscal receipt each. */
  payments: number;
}

/** A difference this small is rounding, not a difference. */
export const Z_TOLERANCE_KURUS = 100;

export interface ZRow {
  key: "cash" | "card" | "total";
  zKurus: Kurus | null;
  tillKurus: Kurus;
  /** Z less till; null when the Z didn't show it. */
  differenceKurus: Kurus | null;
}

/** The Z report beside the till: cash, card, and the total against cash and card together. */
export function compareZ(z: Pick<ZReportProposal, "totalKurus" | "cashKurus" | "cardKurus">, till: TillDay): ZRow[] {
  const row = (key: ZRow["key"], zKurus: Kurus | null, tillKurus: Kurus): ZRow => ({
    key,
    zKurus,
    tillKurus,
    differenceKurus: zKurus === null ? null : zKurus - tillKurus,
  });
  return [row("cash", z.cashKurus, till.cashKurus), row("card", z.cardKurus, till.cardKurus), row("total", z.totalKurus, till.cashKurus + till.cardKurus)];
}

/** Whether a row is off by more than rounding. */
export const zDiffers = (r: ZRow) => r.differenceKurus !== null && Math.abs(r.differenceKurus) > Z_TOLERANCE_KURUS;

// ─────────────────────────────────────────────── confirming

/** What a person saw when they said a statement or Z report was checked. */
export interface CheckOutcome {
  note: string | null;
  /** Statement lines matched (or Z rows that agree), and those that didn't. */
  matched: number;
  unmatched: number;
  /** The statement's closing balance less Peni's, or the Z total less the till's; null when not known. */
  differenceKurus: Kurus | null;
  /** What Peni's bank balance was set by, when the person chose to. */
  correctionKurus: Kurus | null;
}

export const CHECK_NOTE_MAX = 300;
