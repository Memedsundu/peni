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

/** What a document is: a bill is read here; statements and Z reports have their own reading (piece 27). */
export const DOCUMENT_KINDS = ["bill", "bankStatement", "cardStatement", "zReport", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Units a line's quantity can be printed in: the stock units, grams and ml, and packs. */
export const READ_UNITS = ["adet", "kg", "g", "l", "ml", "koli", "paket", "kasa"] as const;
export type ReadUnit = (typeof READ_UNITS)[number];

/** The units a stock item is kept in (packages/core StockUnit). */
const STOCK_UNITS = ["kg", "l", "adet"] as const;

/** One line of a bill, read off a document or out of a quick entry (piece 28). */
export const readLineSchema = z.object({
  name: z.string().describe("What was bought, short, as a person would say it: 'Süt 1 L', 'Kira Ekim'"),
  quantity: z.number().nullable().describe("How many units, when shown: for '2 koli x 12 x 1 L' it is 2"),
  unit: z.enum(READ_UNITS).nullable().describe("The unit the quantity is printed in; koli, paket or kasa when it is counted in packs"),
  total: z.number().describe("The line's amount in TL with its KDV included"),
  category: z.enum(READ_CATEGORIES),
  stockItem: z
    .number()
    .nullable()
    .describe("The number of the café's stock item this line is, from the list given; null when it is none of them or you aren't sure"),
  stockQuantity: z.number().nullable().describe("With stockItem or newItem: how much of that item came, in the item's own unit (kg, l or adet)"),
  newItem: z
    .object({
      name: z.string().describe("A short name for the stock item, without brand or pack size: 'Laktozsuz süt', 'Peçete'"),
      unit: z.enum(STOCK_UNITS).describe("What to keep it in: l for liquids, kg for what is weighed, adet for what is counted"),
    })
    .nullable()
    .describe("When the line is an ingredient or supply the café uses up but none of the stock items listed: the new stock item it could be. null otherwise"),
});

export const billReadingSchema = z.object({
  kind: z
    .enum(DOCUMENT_KINDS)
    .describe(
      "bill: a receipt, invoice or bill for something the café bought or has to pay. bankStatement: a bank account's statement or list of transactions. cardStatement: a credit card's statement. zReport: a cash register's end-of-day Z report. other: anything else",
    ),
  supplierName: z.string().nullable().describe("The seller as printed, e.g. 'Moda Süt Ürünleri Ltd. Şti.'"),
  supplierTaxNumber: z.string().nullable().describe("VKN (10 digits) or TCKN (11 digits) of the seller"),
  supplierPhone: z.string().nullable().describe("The seller's phone number as printed, when shown"),
  supplierIban: z.string().nullable().describe("The seller's IBAN (TR and 24 digits) as printed, when shown"),
  supplierAddress: z.string().nullable().describe("The seller's address as printed, on one line, when shown"),
  number: z.string().nullable().describe("Fatura no, fiş no or belge no"),
  date: day.nullable().describe("The document's date, YYYY-MM-DD"),
  dueDate: day.nullable().describe("Son ödeme tarihi when printed, YYYY-MM-DD"),
  total: z.number().nullable().describe("Genel toplam / ödenecek tutar in TL, KDV included"),
  lines: z.array(readLineSchema).describe("One entry per item line. Leave out KDV, discount and total rows; fold them into the item lines"),
  kdv: z
    .array(z.object({ rate: z.number().describe("The KDV rate in percent: 1, 10 or 20"), amount: z.number().describe("The KDV at that rate in TL") }))
    .describe("The KDV amounts printed on the document, one per rate. Empty when the document doesn't show them"),
  doubts: z.array(z.string()).describe("Short notes in Turkish on anything unclear or guessed, one sentence each. Empty when all is clear"),
});

export type BillReading = z.infer<typeof billReadingSchema>;

export const BILL_INSTRUCTIONS = `You read receipts, invoices and bills for a small café in Turkey and fill in the fields asked for.
Read only what is printed. Never invent a number, date or name: use null when you can't read it, and say so in "doubts".
Amounts are Turkish lira as numbers: "1.234,50" is 1234.5.
Every line amount must include its KDV. When the document lists net amounts and KDV separately, add each line's KDV to it so the lines add up to the total.
Fold discounts into the lines they belong to.
Categories: ingredients (food, drink and anything that goes into what the café sells), supplies (cups, napkins, cleaning), rent, utilities (electricity, water, gas, internet, phone), services (repairs, accounting, delivery), other.
The seller's name, tax number, phone, IBAN and address are those of whoever issued the document, never the café's own (the buyer, "Sayın …").
If this isn't a bill (a bank or card statement, a Z report, a menu, a photo of a person), set kind to what it is and leave the rest empty.
When the document shows its KDV ("KDV %20 ... 301,67", "Toplam KDV"), copy the amount for each rate into "kdv"; never work it out yourself.
Write "doubts" in Turkish, short and plain, for the café owner.`;

export const STOCK_INSTRUCTIONS = `The café keeps stock of the items listed below. For each line that is one of them, set stockItem to its number and stockQuantity to how much of it came, in that item's unit.
For example, with "Süt" kept in l: "Süt 1 L x 24" is 24, "2 koli x 12 x 1 L" is 24. With "Espresso çekirdeği" kept in kg: "1000 g" is 1. With an item kept in adet, count the pieces: "1000 adet" is 1000.
Match only what is clearly the same thing: "Tam yağlı süt 1 L" is Süt, but "Krema" isn't. When unsure, leave stockItem null.`;

export const NEW_ITEM_INSTRUCTIONS = `Some lines are things the café should keep in stock but doesn't yet: an ingredient or supply that gets used up (milk, coffee beans, syrup, cups, napkins, cleaning liquid), bought by weight, volume or count.
For such a line, when it isn't one of the stock items listed, fill in newItem: a short name a café would use, without the brand or pack size ("Laktozsuz süt", not "PINAR LAKTOZSUZ SÜT 1 LT X12"), and the unit to keep it in: l for liquids, kg for what is weighed, adet for what is counted. Set stockQuantity to how much came in that unit: "2 koli x 12 x 1 L" is 24 l, "500 g x 4" is 2 kg.
Leave newItem null for rent, utilities, repairs, services, equipment that isn't used up, and whenever you aren't sure. Never fill in both stockItem and newItem.`;

/** A stock item as the model sees it: a number in the list, a name and the unit it's kept in. */
export interface ReadStockItem {
  name: string;
  unit: "kg" | "l" | "adet";
}

/** The request that reads one document. With the café's stock items, it also says which lines are which item (piece 25). */
export function billReadingRequest(
  document: { name: string; contentType: string; bytes: Uint8Array },
  items: readonly ReadStockItem[] = [],
): AiRequest<BillReading> {
  const part = documentPart(document);
  return {
    purpose: "document.read",
    instructions: [BILL_INSTRUCTIONS, items.length ? STOCK_INSTRUCTIONS : null, NEW_ITEM_INSTRUCTIONS].filter(Boolean).join("\n\n"),
    parts: [{ type: "text", text: `${readThis(document.name)}${items.length ? `\n\nStock items:\n${stockList(items)}` : ""}` }, part],
    schema: billReadingSchema,
    schemaName: "bill_reading",
  };
}

/** "Read this document (ekstre-ekim.pdf)." The file's name can say what it is. */
export function readThis(name: string): string {
  const n = name
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);
  return n ? `Read this document (${n}).` : "Read this document.";
}

/** The model's view of a document: a PDF or a photo. */
export function documentPart(document: { name: string; contentType: string; bytes: Uint8Array }): AiPart {
  return document.contentType === "application/pdf"
    ? { type: "pdf", name: document.name || "belge.pdf", bytes: document.bytes }
    : { type: "image", contentType: document.contentType as "image/jpeg" | "image/png" | "image/webp", bytes: document.bytes };
}

/** "1. Süt (l)", one per line: the numbers the model answers with. */
export function stockList(items: readonly ReadStockItem[]): string {
  return items.map((i, n) => `${n + 1}. ${i.name.replace(/\s+/g, " ")} (${i.unit})`).join("\n");
}

/** KDV rates a Turkish bill can show: today's 1, 10 and 20, and the 8 and 18 of older bills. */
export const KDV_RATES = [1, 8, 10, 18, 20] as const;

/** What was read, in kuruş and thousandths, ready to become a draft. */
export interface ReadBill {
  supplierName: string | null;
  supplierTaxNumber: string | null;
  /** The seller's phone, IBAN ("TR" and 24 digits, no spaces) and address, when printed and they look right. */
  supplierPhone: string | null;
  supplierIban: string | null;
  supplierAddress: string | null;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  /** The total printed on the document, when read. */
  totalKurus: number | null;
  lines: {
    name: string;
    quantityMilli: number | null;
    unit: BillReading["lines"][number]["unit"];
    totalKurus: number;
    category: ReadCategory;
    /** Which of the stock items given (0-based), when the model said so. */
    stockIndex: number | null;
    /** Or the new stock item the model suggests for it (an ingredient or supply line only). */
    newItem: { name: string; unit: (typeof STOCK_UNITS)[number] } | null;
    /** How much of it came, in thousandths of the item's unit. */
    stockQtyMilli: number | null;
  }[];
  /** The KDV printed on it, one entry per rate. */
  kdv: { ratePct: number; amountKurus: number }[];
  doubts: string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const kurus = (tl: number) => Math.round(tl * 100);
const clean = (s: string | null, max: number) => (s?.trim() ? s.trim().slice(0, max) : null);

/**
 * Turns a reading into whole numbers, and checks what can be checked: dates that are
 * real days, lines that add up to the total. Anything off becomes a doubt the owner sees.
 */
export function readBill(r: BillReading, stockCount = 0): ReadBill {
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
      ...stockOf(l, stockCount),
    }));
  const totalKurus = r.total !== null && Number.isFinite(r.total) && r.total > 0 ? kurus(r.total) : null;
  const sum = lines.reduce((s, l) => s + l.totalKurus, 0);
  if (totalKurus !== null && lines.length && Math.abs(sum - totalKurus) > 100)
    doubts.push(`Satırların toplamı ${tl(sum)}, belgedeki toplam ${tl(totalKurus)}. Satırları kontrol et.`);
  if (totalKurus === null) doubts.push("Belgedeki toplam okunamadı.");
  const kdv: ReadBill["kdv"] = [];
  for (const k of r.kdv ?? []) {
    if (!Number.isFinite(k.amount) || k.amount <= 0) continue;
    if (!(KDV_RATES as readonly number[]).includes(k.rate)) {
      doubts.push(`KDV oranı okunamadı (%${k.rate}).`);
      continue;
    }
    const same = kdv.find((x) => x.ratePct === k.rate);
    if (same) same.amountKurus += kurus(k.amount);
    else kdv.push({ ratePct: k.rate, amountKurus: kurus(k.amount) });
  }
  kdv.sort((a, b) => a.ratePct - b.ratePct);
  const kdvSum = kdv.reduce((s, k) => s + k.amountKurus, 0);
  if (kdvSum > 0 && kdvSum >= (totalKurus ?? sum)) {
    doubts.push(`KDV (${tl(kdvSum)}) toplamdan büyük okundu; KDV'yi kontrol et.`);
    kdv.length = 0;
  }
  return {
    supplierName: clean(r.supplierName, 80),
    supplierTaxNumber: clean(r.supplierTaxNumber, 20),
    ...sellerDetails(r),
    number: clean(r.number, 40),
    date,
    dueDate,
    totalKurus,
    lines,
    kdv,
    doubts,
  };
}

/**
 * The seller's phone, IBAN and address, kept only when they look like what they say, so a
 * supplier made from them is never refused for a misread digit. Older readings have none.
 */
function sellerDetails(r: Partial<Pick<BillReading, "supplierPhone" | "supplierIban" | "supplierAddress">>) {
  const phone = r.supplierPhone?.replace(/\s+/g, " ").trim() ?? "";
  const iban = r.supplierIban?.replace(/\s/g, "").toUpperCase() ?? "";
  const address = r.supplierAddress?.replace(/\s+/g, " ").trim().slice(0, 200) ?? "";
  return {
    supplierPhone: /^\+?[\d ()-]{7,20}$/.test(phone) ? phone : null,
    supplierIban: /^TR\d{24}$/.test(iban) ? iban : null,
    supplierAddress: address || null,
  };
}

/** The longest name a stock item can have (packages/core STOCK_NAME_MAX). */
const ITEM_NAME_MAX = 60;

/**
 * The stock item a line was matched to, when the number is one of those given and the amount
 * makes sense; or else the new item suggested for an ingredient or supply line, with how much
 * came. An amount the model left out is taken from the printed one when the units agree.
 */
function stockOf(
  l: BillReading["lines"][number],
  count: number,
): { stockIndex: number | null; newItem: ReadBill["lines"][number]["newItem"]; stockQtyMilli: number | null } {
  const q = l.stockQuantity;
  const qtyMilli = q !== null && q !== undefined && Number.isFinite(q) && q > 0 && q < 1_000_000 ? Math.round(q * 1000) : null;
  const n = l.stockItem;
  if (n !== null && n !== undefined && Number.isInteger(n) && n >= 1 && n <= count) return { stockIndex: n - 1, newItem: null, stockQtyMilli: qtyMilli };
  const name = l.newItem?.name.replace(/\s+/g, " ").trim().slice(0, ITEM_NAME_MAX) ?? "";
  const unit = l.newItem?.unit;
  if (!name || !unit || !(STOCK_UNITS as readonly string[]).includes(unit) || (l.category !== "ingredients" && l.category !== "supplies"))
    return { stockIndex: null, newItem: null, stockQtyMilli: null };
  return { stockIndex: null, newItem: { name, unit }, stockQtyMilli: qtyMilli ?? printedIn(l, unit) };
}

/** The printed quantity in a stock unit, when it is printed in that unit (or grams for kg, ml for l). */
function printedIn(l: Pick<BillReading["lines"][number], "quantity" | "unit">, unit: (typeof STOCK_UNITS)[number]): number | null {
  const q = l.quantity;
  if (q === null || !Number.isFinite(q) || q <= 0 || q >= 1_000_000) return null;
  if (l.unit === unit) return Math.round(q * 1000);
  if ((l.unit === "g" && unit === "kg") || (l.unit === "ml" && unit === "l")) return Math.round(q) || null;
  return null;
}

const tl = (k: number) => `₺${(k / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
