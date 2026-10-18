import { z } from "zod";
import { documentPart, KDV_RATES, readThis } from "./bill-reading";
import type { AiPart, AiRequest } from "./model";

/**
 * Reading what Peni is checked against (plan piece 27): a bank or credit card statement
 * (A5) and a cash register's Z report (A6). The model reads; matching is done by Peni
 * itself, and a person looks before anything is called checked (D21).
 */

const day = z.string().describe("YYYY-MM-DD");

export const STATEMENT_KINDS = [
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
] as const;

export const statementReadingSchema = z.object({
  isStatement: z.boolean().describe("true when this is a bank account statement, a list of an account's transactions, or a credit card statement"),
  account: z.enum(["bank", "card"]).describe("bank: a bank account (vadesiz hesap). card: a credit card"),
  bankName: z.string().nullable(),
  accountHint: z.string().nullable().describe("The last 4 digits of the card number or account number / IBAN, as printed"),
  from: day.nullable().describe("The first day the statement covers"),
  to: day.nullable().describe("The last day the statement covers (hesap kesim tarihi for a card)"),
  opening: z.number().nullable().describe("Bank: the balance before the first line (devreden bakiye). Card: the previous statement's debt"),
  closing: z.number().nullable().describe("Bank: the balance after the last line. Card: this statement's total debt (dönem borcu)"),
  lines: z
    .array(
      z.object({
        date: day,
        description: z.string().describe("The line's description as printed, shortened to what matters"),
        amount: z
          .number()
          .describe(
            "In TL, from the café's side: positive when money came in (a deposit, card sales paid in, a payment to the card), negative when it went out (a payment, a card spend, a fee)",
          ),
        balance: z.number().nullable().describe("The balance after this line, when printed"),
        kind: z.enum(STATEMENT_KINDS).describe("What the line looks like it is"),
      }),
    )
    .describe("Every transaction line, in the order printed. Leave out totals, subtotals and balance-only rows"),
  doubts: z.array(z.string()).describe("Short notes in Turkish on anything unclear or guessed. Empty when all is clear"),
});

export type StatementReading = z.infer<typeof statementReadingSchema>;

export const STATEMENT_INSTRUCTIONS = `You read bank account statements and credit card statements for a small café in Turkey.
Read only what is printed. Never invent a line, a date or an amount; say in "doubts" what you couldn't read.
Amounts are Turkish lira as numbers: "1.234,50" is 1234.5. Give each line's amount from the café's side: money in is positive, money out is negative.
On a bank account statement, "Borç" (or a minus) is money out and "Alacak" (or a plus) is money in.
On a credit card statement, purchases and fees are money out (negative) and payments to the card ("ÖDEME", "Hesaptan ödeme") are money in (positive). Leave out installments not yet billed.
Kinds: cardSales (card sales paid in by the bank: "POS", "Üye işyeri", "ÜİY", "Batch"), supplier (paying a company for goods or services), wages ("Maaş"), tax ("Vergi", "SGK", "GİB", "MTV"), rent ("Kira"), utilities (electricity, water, gas, internet, phone), fee (bank fees, commission, BSMV, interest, "Masraf", "Ücret"), cardPayment (paying the credit card), transfer (between the café's own accounts or the owner's), cash (ATM, cash deposited or withdrawn), loan, check ("Çek"), other.
Dates may be printed DD.MM.YYYY or DD/MM/YYYY; give them as YYYY-MM-DD. In a spreadsheet, a number like 45580 in a date column is an Excel day count (45580 is 2024-10-15).
If it isn't a statement at all, set isStatement false and leave the lines empty.
Write "doubts" in Turkish, short and plain, for the café owner.`;

/** What a statement document becomes for the model: the file itself, or a spreadsheet's rows as text. */
export function statementReadingRequest(
  document: { name: string; contentType: string; bytes: Uint8Array } | { name: string; rows: string[][] },
): AiRequest<StatementReading> {
  const parts: AiPart[] =
    "rows" in document
      ? [
          {
            type: "text",
            text: `${readThis(document.name)} It is a spreadsheet; each row below is one row of it, cells separated by " | ".\n\n${tableText(document.rows)}`,
          },
        ]
      : [{ type: "text", text: readThis(document.name) }, documentPart(document)];
  return { purpose: "statement.read", instructions: STATEMENT_INSTRUCTIONS, parts, schema: statementReadingSchema, schemaName: "statement_reading" };
}

/** The most rows of a spreadsheet the model is shown. */
export const SHEET_ROWS_SHOWN = 800;

function tableText(rows: string[][]): string {
  return rows
    .slice(0, SHEET_ROWS_SHOWN)
    .map((r) => r.map((c) => c.replace(/\s+/g, " ").trim().slice(0, 80)).join(" | "))
    .join("\n");
}

export const zReadingSchema = z.object({
  isZReport: z.boolean().describe("true when this is a cash register's end-of-day Z report (Z raporu)"),
  date: day.nullable(),
  zNumber: z.string().nullable().describe("Z NO"),
  total: z.number().nullable().describe("The day's total sales, KDV included (TOPLAM, GENEL TOPLAM)"),
  cash: z.number().nullable().describe("Paid in cash (NAKİT)"),
  card: z.number().nullable().describe("Paid by bank or credit card (KREDİ KARTI, K.KARTI, BANKA KARTI)"),
  other: z.number().nullable().describe("Paid any other way: meal cards, vouchers, others added together. Null when none is printed"),
  receipts: z.number().nullable().describe("How many receipts (FİŞ SAYISI, MALİ FİŞ)"),
  refunds: z.number().nullable().describe("Returns (İADE), when printed"),
  kdv: z.array(z.object({ rate: z.number().describe("1, 10 or 20"), amount: z.number().describe("The KDV at that rate in TL") })),
  doubts: z.array(z.string()).describe("Short notes in Turkish on anything unclear. Empty when all is clear"),
});

export type ZReading = z.infer<typeof zReadingSchema>;

export const Z_INSTRUCTIONS = `You read the end-of-day Z report (Z raporu) of a cash register (ÖKC) for a small café in Turkey.
Read only what is printed; use null for what you can't read and say so in "doubts". Amounts are Turkish lira as numbers: "1.234,50" is 1234.5.
"total" is the day's sales total with KDV. Split payments: cash (NAKİT), card (KREDİ KARTI, BANKA KARTI, K.KARTI) and anything else together in "other".
Copy the KDV printed for each rate (TOPKDV, KDV %10 ...); never work it out yourself.
If it isn't a Z report (an X report, a single receipt, something else), set isZReport false.
Write "doubts" in Turkish, short and plain, for the café owner.`;

export function zReadingRequest(document: { name: string; contentType: string; bytes: Uint8Array }): AiRequest<ZReading> {
  return {
    purpose: "zreport.read",
    instructions: Z_INSTRUCTIONS,
    parts: [{ type: "text", text: readThis(document.name) }, documentPart(document)],
    schema: zReadingSchema,
    schemaName: "z_reading",
  };
}

// ─────────────────────────────────────────────── into whole numbers

/** At most this many statement lines are kept. */
export const STATEMENT_LINES_MAX = 600;

export interface ReadStatement {
  account: "bank" | "card";
  bankName: string | null;
  accountHint: string | null;
  from: string | null;
  to: string | null;
  openingKurus: number | null;
  closingKurus: number | null;
  lines: { date: string; description: string; amountKurus: number; balanceKurus: number | null; guess: (typeof STATEMENT_KINDS)[number] }[];
  doubts: string[];
}

/** A statement in kuruş, its dates checked, and the doubts a sum can raise. */
export function readStatement(r: StatementReading): ReadStatement {
  const doubts = r.doubts.map((d) => d.trim()).filter(Boolean);
  let skipped = 0;
  const lines: ReadStatement["lines"] = [];
  for (const l of r.lines) {
    const amountKurus = money(l.amount);
    if (!realDay(l.date) || amountKurus === null || amountKurus === 0) {
      skipped++;
      continue;
    }
    lines.push({
      date: l.date,
      description: l.description.replace(/\s+/g, " ").trim().slice(0, 160),
      amountKurus,
      balanceKurus: money(l.balance),
      guess: l.kind,
    });
  }
  if (skipped) doubts.push(`${skipped} satırın tarihi ya da tutarı okunamadı, listede yok.`);
  if (lines.length > STATEMENT_LINES_MAX) {
    doubts.push(`Ekstrede ${lines.length} satır var; ilk ${STATEMENT_LINES_MAX} satıra bakıldı.`);
    lines.length = STATEMENT_LINES_MAX;
  }
  const days = lines.map((l) => l.date).sort();
  const from = realDay(r.from) ? r.from : (days[0] ?? null);
  const to = realDay(r.to) ? r.to : (days.at(-1) ?? null);
  const openingKurus = money(r.opening);
  const closingKurus = money(r.closing);
  if (r.account === "bank" && openingKurus !== null && closingKurus !== null && lines.length) {
    const sum = lines.reduce((s, l) => s + l.amountKurus, 0);
    if (Math.abs(openingKurus + sum - closingKurus) > 100)
      doubts.push("Satırlar açılış ve kapanış bakiyesiyle tutmuyor; eksik ya da yanlış okunmuş satır olabilir.");
  }
  return {
    account: r.account,
    bankName: clean(r.bankName, 60),
    accountHint: clean(r.accountHint, 30),
    from,
    to,
    openingKurus,
    closingKurus,
    lines,
    doubts,
  };
}

export interface ReadZ {
  date: string | null;
  zNumber: string | null;
  totalKurus: number | null;
  cashKurus: number | null;
  cardKurus: number | null;
  otherKurus: number | null;
  receipts: number | null;
  refundsKurus: number | null;
  kdv: { ratePct: number; amountKurus: number }[];
  doubts: string[];
}

/** A Z report in kuruş; a total that the payments don't add up to becomes a doubt. */
export function readZ(r: ZReading): ReadZ {
  const doubts = r.doubts.map((d) => d.trim()).filter(Boolean);
  const date = realDay(r.date) ? r.date : null;
  if (!date) doubts.push("Z raporunun tarihi okunamadı.");
  const totalKurus = money(r.total);
  const cashKurus = money(r.cash);
  const cardKurus = money(r.card);
  const otherKurus = money(r.other);
  if (totalKurus !== null && cashKurus !== null && cardKurus !== null) {
    const paid = cashKurus + cardKurus + (otherKurus ?? 0);
    if (Math.abs(paid - totalKurus) > 100) doubts.push("Nakit ve kart toplamı Z raporundaki toplamla tutmuyor.");
  }
  const kdv: ReadZ["kdv"] = [];
  for (const k of r.kdv) {
    const amountKurus = money(k.amount);
    if (!amountKurus || amountKurus < 0 || !(KDV_RATES as readonly number[]).includes(k.rate)) continue;
    const same = kdv.find((x) => x.ratePct === k.rate);
    if (same) same.amountKurus += amountKurus;
    else kdv.push({ ratePct: k.rate, amountKurus });
  }
  kdv.sort((a, b) => a.ratePct - b.ratePct);
  return {
    date,
    zNumber: clean(r.zNumber, 20),
    totalKurus,
    cashKurus,
    cardKurus,
    otherKurus,
    receipts: r.receipts !== null && Number.isInteger(r.receipts) && r.receipts >= 0 && r.receipts < 100_000 ? r.receipts : null,
    refundsKurus: money(r.refunds),
    kdv,
    doubts,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function realDay(d: string | null | undefined): d is string {
  return !!d && DAY.test(d) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);
}

/** Lira to kuruş, within what one record may be; null for anything else. */
function money(tl: number | null | undefined): number | null {
  if (tl === null || tl === undefined || !Number.isFinite(tl)) return null;
  const k = Math.round(tl * 100);
  return Math.abs(k) <= 1_000_000_000 ? k : null;
}

const clean = (s: string | null, max: number) => (s?.trim() ? s.trim().slice(0, max) : null);
