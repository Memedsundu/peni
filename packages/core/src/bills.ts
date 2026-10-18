import type { Kurus } from "./money";
import { MILLI } from "./stock";

/**
 * Faturalar and Tedarikçiler (plan piece 18). Every bill or receipt the café gets is one
 * kind of record, whether it brought stock (milk, cups) or not (rent, a repair). Shelby
 * kept purchase receipts and expenses apart and let them drift; here a bill's stock lines
 * add the stock and set the item's price, and the same bill is what the café owes.
 *
 * - Money is whole kuruş, amounts whole thousandths, as everywhere else. A line's total is
 *   what the bill says for it, KDV included.
 * - A bill is corrected, never rewritten behind stock's back: each correction bumps its
 *   version and moves stock by the difference, and a void takes its stock back out.
 * - An item's price comes from its latest bill (by the bill's date), so entering an old
 *   bill late doesn't overwrite today's price.
 */

/** What a line was for. Stock lines take theirs from the item (ingredient or supply). */
export type BillCategory = "ingredients" | "supplies" | "rent" | "utilities" | "services" | "wages" | "other";
export const BILL_CATEGORIES: readonly BillCategory[] = ["ingredients", "supplies", "rent", "utilities", "services", "wages", "other"];

/**
 * How a bill was paid (piece 19). Cash, the café's bank card and a transfer settle it there
 * and then. The other three move what is owed elsewhere, to Borçlar: "credit" onto the
 * credit card, "check" into a check due later, "loan" to whoever paid it out of pocket.
 */
export type BillPayMethod = "cash" | "card" | "bank" | "credit" | "check" | "loan";
export const BILL_PAY_METHODS: readonly BillPayMethod[] = ["cash", "card", "bank", "credit", "check", "loan"];

export const SUPPLIER_NAME_MAX = 80;
export const BILL_MAX_LINES = 50;
export const BILL_NOTE_MAX = 300;
/** One line can't be more than a million lira. */
export const BILL_LINE_MAX_KURUS = 100_000_000;

export interface Supplier {
  id: string;
  cafeId: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** VKN (10 digits) or, for a person, TCKN (11). */
  taxNo: string | null;
  /** "TR" and 24 digits, without spaces. */
  iban: string | null;
  note: string | null;
  /** "Kaldır": hidden from new bills, kept on old ones. */
  archivedAt: Date | null;
  createdAt: Date;
}

export interface BillLine {
  /** The stock item it brought; null for a line that isn't stock (rent, a repair). */
  itemId: string | null;
  /** The item's name when the bill was entered, or what the line was for. */
  name: string;
  category: BillCategory;
  /** Stock lines only: how much came, in thousandths of the item's unit. */
  qtyMilli: number | null;
  /** What the bill says for this line, KDV included. */
  totalKurus: Kurus;
}

export interface BillPayment {
  id: string;
  cafeId: string;
  billId: string;
  amountKurus: Kurus;
  method: BillPayMethod;
  /** The day it was paid, in the café's time zone: "2026-10-18". */
  paidOn: string;
  memberId: string;
  createdAt: Date;
}

export interface Bill {
  id: string;
  cafeId: string;
  supplierId: string | null;
  /** The number printed on it, when there is one. */
  number: string | null;
  /** The bill's own date, in the café's time zone: "2026-10-18". */
  date: string;
  /** When it should be paid by; null when it was paid on the spot or has no term. */
  dueDate: string | null;
  note: string | null;
  lines: BillLine[];
  totalKurus: Kurus;
  /** What has been paid so far, in one payment or several. */
  paidKurus: Kurus;
  /** When the last of it was paid; null while anything is owed. */
  paidAt: Date | null;
  /** Read only: filled in by the store. */
  payments: BillPayment[];
  /** 1 when added; each correction adds one. Its stock moves are batch `bill:<id>:<version>`. */
  version: number;
  voidedAt: Date | null;
  voidedById: string | null;
  voidReason: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  /** The same key twice adds the bill once. */
  createKey: string;
}

/** The latest price paid for an item, from the newest bill (by its date) that has a priced line for it. */
export interface LastPrice {
  billId: string;
  date: string;
  qtyMilli: number;
  totalKurus: Kurus;
}

export interface BillQuery {
  supplierId?: string;
  /** Bills with a line for this stock item. */
  itemId?: string;
  /** Bill dates from and to, inclusive ("2026-10-01"). */
  from?: string;
  to?: string;
  /** Only bills still owed (not voided, not paid). */
  unpaid?: boolean;
  includeVoided?: boolean;
  limit?: number;
}

export interface BillStore {
  listSuppliers(cafeId: string, opts?: { includeArchived?: boolean }): Promise<Supplier[]>;
  getSupplier(cafeId: string, id: string): Promise<Supplier | null>;
  saveSupplier(supplier: Supplier): Promise<void>;
  /** Newest bill date first, then newest entered. With their payments. */
  listBills(cafeId: string, query?: BillQuery): Promise<Bill[]>;
  getBill(cafeId: string, id: string): Promise<Bill | null>;
  findBillByKey(cafeId: string, createKey: string): Promise<Bill | null>;
  /** Creates the bill or replaces its details and lines. Payments are left alone. */
  saveBill(bill: Bill): Promise<void>;
  addPayment(payment: BillPayment): Promise<void>;
  getPayment(cafeId: string, id: string): Promise<BillPayment | null>;
  /** "Geri al": one payment, made by mistake. */
  removePayment(cafeId: string, id: string): Promise<void>;
  /** Oldest first; only this method when given (the credit card's charges). */
  listPayments(cafeId: string, opts?: { method?: BillPayMethod }): Promise<BillPayment[]>;
  lastPrice(cafeId: string, itemId: string): Promise<LastPrice | null>;
}

/** What one kg, litre or piece cost on a line, in kuruş. */
export function unitCost(line: Pick<BillLine, "qtyMilli" | "totalKurus">): Kurus | null {
  if (!line.qtyMilli || line.qtyMilli <= 0) return null;
  return Math.round((line.totalKurus * MILLI) / line.qtyMilli);
}

export function billTotal(lines: readonly Pick<BillLine, "totalKurus">[]): Kurus {
  return lines.reduce((s, l) => s + l.totalKurus, 0);
}

/** Stock each item gets from a bill's lines. */
export function billStock(lines: readonly Pick<BillLine, "itemId" | "qtyMilli">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) if (l.itemId && l.qtyMilli) out.set(l.itemId, (out.get(l.itemId) ?? 0) + l.qtyMilli);
  return out;
}

/** What has to move so stock matches `next` instead of `previous`: items with no difference are left out. */
export function stockDifference(previous: ReadonlyMap<string, number>, next: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const d = (next.get(id) ?? 0) - (previous.get(id) ?? 0);
    if (d !== 0) out.set(id, d);
  }
  return out;
}

export type BillState = "unpaid" | "overdue" | "paid" | "voided";

/** Voided, paid, past its due date (`today` is the café's local date), or simply unpaid. */
export function billState(bill: Pick<Bill, "voidedAt" | "paidAt" | "dueDate">, today: string): BillState {
  if (bill.voidedAt) return "voided";
  if (bill.paidAt) return "paid";
  if (bill.dueDate && bill.dueDate < today) return "overdue";
  return "unpaid";
}

export type SupplierProblem = "NAME_EMPTY" | "NAME_TOO_LONG" | "PHONE_INVALID" | "EMAIL_INVALID" | "TAX_NO_INVALID" | "IBAN_INVALID";

export function supplierProblem(s: Pick<Supplier, "name" | "phone" | "email" | "taxNo" | "iban">): SupplierProblem | null {
  if (!s.name.trim()) return "NAME_EMPTY";
  if (s.name.trim().length > SUPPLIER_NAME_MAX) return "NAME_TOO_LONG";
  if (s.phone !== null && !/^\+?[\d ()-]{7,20}$/.test(s.phone)) return "PHONE_INVALID";
  if (s.email !== null && (s.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))) return "EMAIL_INVALID";
  if (s.taxNo !== null && !/^\d{10,11}$/.test(s.taxNo)) return "TAX_NO_INVALID";
  if (s.iban !== null && !/^TR\d{24}$/.test(s.iban)) return "IBAN_INVALID";
  return null;
}

/** "tr12 0006 …" → "TR120006…"; spaces in a tax number or phone are dropped the same way. */
export function compactIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/** A calendar date "YYYY-MM-DD" that exists. */
export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function matches(bill: Bill, q: BillQuery): boolean {
  if (q.supplierId && bill.supplierId !== q.supplierId) return false;
  if (q.itemId && !bill.lines.some((l) => l.itemId === q.itemId)) return false;
  if (q.from && bill.date < q.from) return false;
  if (q.to && bill.date > q.to) return false;
  if (!q.includeVoided && !q.unpaid && bill.voidedAt) return false;
  if (q.unpaid && (bill.voidedAt || bill.paidAt)) return false;
  return true;
}

function newestFirst(a: Bill, b: Bill): number {
  return b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
}

export class InMemoryBillStore implements BillStore {
  private readonly suppliers = new Map<string, Supplier>();
  private readonly bills = new Map<string, Bill>();
  private readonly payments: BillPayment[] = [];

  async listSuppliers(cafeId: string, opts: { includeArchived?: boolean } = {}) {
    return [...this.suppliers.values()]
      .filter((s) => s.cafeId === cafeId && (opts.includeArchived || !s.archivedAt))
      .map((s) => ({ ...s }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  async getSupplier(cafeId: string, id: string) {
    const s = this.suppliers.get(id);
    return s && s.cafeId === cafeId ? { ...s } : null;
  }

  async saveSupplier(supplier: Supplier) {
    this.suppliers.set(supplier.id, { ...supplier });
  }

  async listBills(cafeId: string, query: BillQuery = {}) {
    const out = [...this.bills.values()]
      .filter((b) => b.cafeId === cafeId && matches(b, query))
      .sort(newestFirst)
      .map((b) => this.read(b));
    return query.limit === undefined ? out : out.slice(0, query.limit);
  }

  async getBill(cafeId: string, id: string) {
    const b = this.bills.get(id);
    return b && b.cafeId === cafeId ? this.read(b) : null;
  }

  async findBillByKey(cafeId: string, createKey: string) {
    const b = [...this.bills.values()].find((x) => x.cafeId === cafeId && x.createKey === createKey);
    return b ? this.read(b) : null;
  }

  async saveBill(bill: Bill) {
    this.bills.set(bill.id, { ...bill, lines: bill.lines.map((l) => ({ ...l })), payments: [] });
  }

  async addPayment(payment: BillPayment) {
    this.payments.push({ ...payment });
  }

  async getPayment(cafeId: string, id: string) {
    const p = this.payments.find((x) => x.cafeId === cafeId && x.id === id);
    return p ? { ...p } : null;
  }

  async removePayment(cafeId: string, id: string) {
    const i = this.payments.findIndex((p) => p.cafeId === cafeId && p.id === id);
    if (i >= 0) this.payments.splice(i, 1);
  }

  async listPayments(cafeId: string, opts: { method?: BillPayMethod } = {}) {
    return this.payments
      .filter((p) => p.cafeId === cafeId && (!opts.method || p.method === opts.method))
      .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((p) => ({ ...p }));
  }

  async lastPrice(cafeId: string, itemId: string) {
    for (const b of [...this.bills.values()].filter((x) => x.cafeId === cafeId && !x.voidedAt).sort(newestFirst)) {
      const line = b.lines.find((l) => l.itemId === itemId && l.qtyMilli && l.totalKurus > 0);
      if (line) return { billId: b.id, date: b.date, qtyMilli: line.qtyMilli!, totalKurus: line.totalKurus };
    }
    return null;
  }

  private read(b: Bill): Bill {
    return {
      ...b,
      lines: b.lines.map((l) => ({ ...l })),
      payments: this.payments.filter((p) => p.billId === b.id).map((p) => ({ ...p })),
    };
  }
}
