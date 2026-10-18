import { z } from "zod";
import type { AiPart, AiRequest } from "./model";

/**
 * Reading a bill: a photo or PDF of a receipt or invoice in, the fields of a bill out
 * (plan pieces 24 and 25). The model reads; the owner checks and confirms (D21).
 */

/** Bill categories the model may pick; wages never come from a document. */
export const READ_CATEGORIES = ["ingredients", "supplies", "rent", "utilities", "services", "other"] as const;
export type ReadCategory = (typeof READ_CATEGORIES)[number];

const day = z.string().describe("YYYY-MM-DD");

export const billReadingSchema = z.object({
  isBill: z.boolean().describe("true when this is a receipt, invoice or bill for something the café bought or has to pay"),
  supplierName: z.string().nullable().describe("The seller as printed, e.g. 'Moda Süt Ürünleri Ltd. Şti.'"),
  supplierTaxNumber: z.string().nullable().describe("VKN (10 digits) or TCKN (11 digits) of the seller"),
  number: z.string().nullable().describe("Fatura no, fiş no or belge no"),
  date: day.nullable().describe("The document's date, YYYY-MM-DD"),
  dueDate: day.nullable().describe("Son ödeme tarihi when printed, YYYY-MM-DD"),
  total: z.number().nullable().describe("Genel toplam / ödenecek tutar in TL, KDV included"),
  lines: z
    .array(
      z.object({
        name: z.string().describe("What was bought, short, as a person would say it: 'Süt 1 L', 'Kira Ekim'"),
        quantity: z.number().nullable().describe("How many units, when shown"),
        unit: z.enum(["adet", "kg", "g", "l", "ml"]).nullable(),
        total: z.number().describe("The line's amount in TL with its KDV included"),
        category: z.enum(READ_CATEGORIES),
      }),
    )
    .describe("One entry per item line. Leave out KDV, discount and total rows; fold them into the item lines"),
  doubts: z.array(z.string()).describe("Short notes in Turkish on anything unclear or guessed, one sentence each. Empty when all is clear"),
});

export type BillReading = z.infer<typeof billReadingSchema>;

export const BILL_INSTRUCTIONS = `You read receipts, invoices and bills for a small café in Turkey and fill in the fields asked for.
Read only what is printed. Never invent a number, date or name: use null when you can't read it, and say so in "doubts".
Amounts are Turkish lira as numbers: "1.234,50" is 1234.5.
Every line amount must include its KDV. When the document lists net amounts and KDV separately, add each line's KDV to it so the lines add up to the total.
Fold discounts into the lines they belong to.
Categories: ingredients (food, drink and anything that goes into what the café sells), supplies (cups, napkins, cleaning), rent, utilities (electricity, water, gas, internet, phone), services (repairs, accounting, delivery), other.
If this isn't a bill at all (a menu, a photo of a person, a bank statement), set isBill false and leave the rest empty.
Write "doubts" in Turkish, short and plain, for the café owner.`;

/** The request that reads one document. */
export function billReadingRequest(document: { name: string; contentType: string; bytes: Uint8Array }): AiRequest<BillReading> {
  const part: AiPart =
    document.contentType === "application/pdf"
      ? { type: "pdf", name: document.name || "belge.pdf", bytes: document.bytes }
      : { type: "image", contentType: document.contentType as "image/jpeg" | "image/png" | "image/webp", bytes: document.bytes };
  return {
    purpose: "document.read",
    instructions: BILL_INSTRUCTIONS,
    parts: [{ type: "text", text: "Read this document." }, part],
    schema: billReadingSchema,
    schemaName: "bill_reading",
  };
}

/** What was read, in kuruş and thousandths, ready to become a draft. */
export interface ReadBill {
  supplierName: string | null;
  supplierTaxNumber: string | null;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  /** The total printed on the document, when read. */
  totalKurus: number | null;
  lines: { name: string; quantityMilli: number | null; unit: BillReading["lines"][number]["unit"]; totalKurus: number; category: ReadCategory }[];
  doubts: string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const kurus = (tl: number) => Math.round(tl * 100);
const clean = (s: string | null, max: number) => (s?.trim() ? s.trim().slice(0, max) : null);

/**
 * Turns a reading into whole numbers, and checks what can be checked: dates that are
 * real days, lines that add up to the total. Anything off becomes a doubt the owner sees.
 */
export function readBill(r: BillReading): ReadBill {
  const doubts = r.doubts.map((d) => d.trim()).filter(Boolean);
  const dayOrNull = (d: string | null, what: string) => {
    if (d === null) return null;
    if (DAY.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d)) return d;
    doubts.push(`${what} okunamadı ("${d}").`);
    return null;
  };
  const date = dayOrNull(r.date, "Tarih");
  const dueDate = dayOrNull(r.dueDate, "Son ödeme tarihi");
  const lines = r.lines
    .filter((l) => l.name.trim() && Number.isFinite(l.total) && l.total > 0)
    .map((l) => ({
      name: l.name.trim().slice(0, 80),
      quantityMilli: l.quantity !== null && Number.isFinite(l.quantity) && l.quantity > 0 ? Math.round(l.quantity * 1000) : null,
      unit: l.unit,
      totalKurus: kurus(l.total),
      category: l.category,
    }));
  const totalKurus = r.total !== null && Number.isFinite(r.total) && r.total > 0 ? kurus(r.total) : null;
  const sum = lines.reduce((s, l) => s + l.totalKurus, 0);
  if (totalKurus !== null && lines.length && Math.abs(sum - totalKurus) > 100)
    doubts.push(`Satırların toplamı ${tl(sum)}, belgedeki toplam ${tl(totalKurus)}. Satırları kontrol et.`);
  if (totalKurus === null) doubts.push("Belgedeki toplam okunamadı.");
  return {
    supplierName: clean(r.supplierName, 80),
    supplierTaxNumber: clean(r.supplierTaxNumber, 20),
    number: clean(r.number, 40),
    date,
    dueDate,
    totalKurus,
    lines,
    doubts,
  };
}

const tl = (k: number) => `₺${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
