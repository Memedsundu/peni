import { z } from "zod";
import { readBill, readLineSchema, stockList, STOCK_INSTRUCTIONS, type ReadBill, type ReadStockItem } from "./bill-reading";
import type { AiRequest } from "./model";

/**
 * Quick entry (plan piece 28, A7): "Tesisatçıya 450 lira nakit ödedim" typed or said, and
 * out come one or more expenses to check, like bills read off a document. The model only
 * fills in fields; a person confirms each one (D21).
 */

export const PAID_SAID = ["cash", "card", "bank", "credit", "unpaid", "unknown"] as const;

const day = z.string().describe("YYYY-MM-DD");

export const quickReadingSchema = z.object({
  expenses: z
    .array(
      z.object({
        supplier: z
          .number()
          .nullable()
          .describe("The number of the café's supplier this was paid to or bought from, from the list given; null when it is none of them"),
        supplierName: z.string().nullable().describe("Who it was paid to or bought from, as said, when not in the list: 'Tesisatçı Ahmet', 'Simitçi'"),
        date: day.describe("The day it was bought or paid, YYYY-MM-DD: today unless the words say another day ('dün', 'pazartesi', '3 Ekim')"),
        dueDate: day.nullable().describe("When it has to be paid, if said and not paid yet"),
        paid: z
          .enum(PAID_SAID)
          .describe(
            "How it was paid, if said: cash (nakit, elden, kasadan), card (kartla, banka kartı), bank (havale, EFT, bankadan), credit (kredi kartıyla). unpaid when it was said it isn't paid yet (borç, sonra ödenecek, veresiye). unknown when the words don't say",
          ),
        lines: z.array(readLineSchema).describe("What was bought or paid for, one line per thing with its amount"),
      }),
    )
    .describe(
      "One entry per separate expense; several only when the words name several payees or purchases. Empty when the words aren't about money the café spent",
    ),
  doubts: z.array(z.string()).describe("Short notes in Turkish on anything unclear or guessed, one sentence each. Empty when all is clear"),
});

export type QuickReading = z.infer<typeof quickReadingSchema>;

export const QUICK_INSTRUCTIONS = `A person at a small café in Turkey typed or said a short note about money the café spent. Turn it into expenses to be entered, filling in the fields asked for.
Take only what the words say. Never invent an amount or a name: when the amount isn't said, leave the expense out and say so in "doubts".
Amounts are Turkish lira: "450", "450 lira", "450 TL", "dört yüz elli", "1.250,50" (1250.5), "2 bin" (2000). Each line's total is what was paid for it, KDV included.
Categories: ingredients (food, drink and anything that goes into what the café sells), supplies (cups, napkins, cleaning, small things for the café), rent, utilities (electricity, water, gas, internet, phone), services (repairs, a plumber, an electrician, accounting, delivery, cleaning staff from outside), other.
Wages, money moved between the café's own accounts, sales and tips aren't expenses here: leave them out and say so in "doubts".
Spoken notes come from speech recognition and may have small mistakes; read them as a person would.
Write "doubts" in Turkish, short and plain, for the café owner.`;

/** A supplier as the model sees it: a number in the list and a name. */
export interface QuickSupplier {
  name: string;
}

/** The request that reads one quick entry, with the café's suppliers and stock items to match against. */
export function quickReadingRequest(
  entry: { text: string; voice: boolean },
  context: { today: string; weekday: string; suppliers: readonly QuickSupplier[]; items: readonly ReadStockItem[] },
): AiRequest<QuickReading> {
  const lists = [
    `Today is ${context.today} (${context.weekday}).`,
    context.suppliers.length
      ? `Suppliers:\n${context.suppliers.map((s, n) => `${n + 1}. ${s.name.replace(/\s+/g, " ")}`).join("\n")}`
      : "The café has no suppliers yet.",
    context.items.length ? `Stock items:\n${stockList(context.items)}` : "",
  ].filter(Boolean);
  return {
    purpose: "note.read",
    instructions: context.items.length ? `${QUICK_INSTRUCTIONS}\n\n${STOCK_INSTRUCTIONS}` : QUICK_INSTRUCTIONS,
    parts: [
      { type: "text", text: lists.join("\n\n") },
      { type: "text", text: `${entry.voice ? "What they said" : "What they wrote"}:\n${entry.text.replace(/\s+/g, " ").trim()}` },
    ],
    schema: quickReadingSchema,
    schemaName: "quick_entry",
  };
}

/** One expense out of a quick entry, ready to become a bill draft. */
export interface ReadQuickExpense extends ReadBill {
  /** Which of the suppliers given (0-based), when the model said so. */
  supplierIndex: number | null;
  paid: Exclude<(typeof PAID_SAID)[number], "unpaid" | "unknown"> | null;
}

export interface ReadQuick {
  expenses: ReadQuickExpense[];
  /** Notes on the entry as a whole; each expense has its own too. */
  doubts: string[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const realDay = (d: string | null) => !!d && DAY.test(d) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

/**
 * Whole numbers, checked: a day in the future or unreadable becomes today with a note,
 * an expense with nothing to pay is left out. At most `max` expenses are kept.
 */
export function readQuick(r: QuickReading, opts: { today: string; suppliers: number; items: number; max: number }): ReadQuick {
  const doubts = r.doubts.map((d) => d.trim()).filter(Boolean);
  const expenses: ReadQuickExpense[] = [];
  for (const e of r.expenses) {
    const extra: string[] = [];
    let date = e.date;
    if (!realDay(date)) {
      extra.push("Tarih anlaşılamadı; bugün yazıldı.");
      date = opts.today;
    } else if (date > opts.today) {
      extra.push("Tarih ileride göründü; bugün yazıldı.");
      date = opts.today;
    }
    const total = e.lines.reduce((s, l) => s + (Number.isFinite(l.total) && l.total > 0 ? l.total : 0), 0);
    const read = readBill(
      {
        kind: "bill",
        supplierName: e.supplierName,
        supplierTaxNumber: null,
        number: null,
        date,
        dueDate: e.dueDate,
        total: total || null,
        lines: e.lines,
        kdv: [],
        doubts: [],
      },
      opts.items,
    );
    if (!read.lines.length) continue;
    const n = e.supplier;
    const supplierIndex = n !== null && Number.isInteger(n) && n >= 1 && n <= opts.suppliers ? n - 1 : null;
    expenses.push({
      ...read,
      // A due date only means something while it's owed.
      dueDate: e.paid === "unpaid" || e.paid === "unknown" ? (read.dueDate && read.dueDate >= date ? read.dueDate : null) : null,
      doubts: [...extra, ...read.doubts.filter((d) => !d.startsWith("Belgedeki toplam"))],
      supplierIndex,
      paid: e.paid === "unpaid" || e.paid === "unknown" ? null : e.paid,
    });
    if (expenses.length >= opts.max) {
      if (r.expenses.length > opts.max) doubts.push(`İlk ${opts.max} gider yazıldı; gerisini ayrıca gönder.`);
      break;
    }
  }
  return { expenses, doubts };
}

export const TURKISH_WEEKDAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;
