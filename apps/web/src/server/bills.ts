import type { BillDTO, BillsDTO, BillSummaryDTO, SupplierDTO, SupplierPriceDTO, SuppliersDTO, SupplierSummaryDTO } from "@peni/api";
import {
  billState,
  billStock,
  billTotal,
  compactIban,
  localDateKey,
  sameMenuName,
  stockDifference,
  supplierProblem,
  unitCost,
  validDate,
  type Bill,
  type BillCategory,
  type BillLine,
  type BillPayMethod,
  type BillStore,
  type PeniDirectory,
  type Permission,
  type StaffStore,
  type StockItem,
  type StockStore,
  type Supplier,
} from "@peni/core";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

const DAY_MS = 86_400_000;
/** Bills a supplier page lists, and price points per item. */
const SUPPLIER_BILLS = 50;
const PRICE_POINTS = 12;

export interface BillLineInput {
  itemId: string | null;
  name?: string;
  category?: BillCategory;
  qtyMilli?: number | null;
  totalKurus: number;
}

export interface BillInput {
  supplierId: string | null;
  number?: string | null;
  date: string;
  dueDate?: string | null;
  note?: string | null;
  lines: BillLineInput[];
}

export interface SupplierInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  taxNo?: string | null;
  iban?: string | null;
  note?: string | null;
}

/**
 * Faturalar and Tedarikçiler (plan piece 18). A bill is the one way stock comes in and
 * the record of what the café owes: its stock lines add the stock and set each item's
 * price from the latest bill, all in one transaction with the bill itself. Anyone can add
 * a bill (the milk comes while the barista is alone); correcting, voiding and paying stay
 * with "bills.manage" (the manager), as money does.
 */
export class BillService {
  constructor(
    private readonly store: BillStore,
    private readonly stock: StockStore,
    private readonly directory: PeniDirectory,
    private readonly staff: StaffStore,
    /** Runs the bill, its stock moves and the prices together (the ledger's transaction). */
    private readonly atomically: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly now: () => Date,
  ) {}

  // ─────────────────────────────────────────────── Faturalar

  async list(ctx: StaffContext, query: { month?: string; show?: "month" | "owed" } = {}): Promise<BillsDTO> {
    this.require(ctx, "bills.view");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    const month = query.month ?? today.slice(0, 7);
    const [monthBills, owed, suppliers, items] = await Promise.all([
      this.store.listBills(cafeId, { from: `${month}-01`, to: `${month}-31`, includeVoided: true }),
      this.store.listBills(cafeId, { unpaid: true }),
      this.store.listSuppliers(cafeId, { includeArchived: true }),
      this.stock.listItems(cafeId),
    ]);
    const names = new Map(suppliers.map((s) => [s.id, s.name]));
    const counted = monthBills.filter((b) => !b.voidedAt);
    const byCategory = new Map<BillCategory, number>();
    for (const b of counted) for (const l of b.lines) byCategory.set(l.category, (byCategory.get(l.category) ?? 0) + l.totalKurus);
    return {
      month: query.show === "owed" ? null : month,
      bills: (query.show === "owed" ? owed : monthBills).map((b) => summary(b, names, today)),
      monthTotalKurus: billTotal(counted.map((b) => ({ totalKurus: b.totalKurus }))),
      byCategory: [...byCategory].map(([category, totalKurus]) => ({ category, totalKurus })).sort((a, b) => b.totalKurus - a.totalKurus),
      owed: owedSum(owed, today),
      today,
      suppliers: suppliers.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name })),
      items: items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, kind: i.kind, costKurus: i.costKurus })),
      canAdd: ctx.permissions.has("bills.add"),
      canManage: ctx.permissions.has("bills.manage"),
      canAddSupplier: ctx.permissions.has("suppliers.edit"),
    };
  }

  async get(ctx: StaffContext, billId: string): Promise<BillDTO> {
    this.require(ctx, "bills.view");
    return this.dto(ctx, await this.bill(ctx, billId));
  }

  /**
   * "Fatura ekle". Stock lines add their amount to the item and set its price, unless a
   * newer bill already priced it. The same `key` twice adds it once. `paid` marks it paid
   * on the spot, which needs "bills.manage".
   */
  async add(ctx: StaffContext, input: BillInput & { key: string; paid?: { method: BillPayMethod } }): Promise<BillDTO> {
    this.require(ctx, "bills.add");
    if (input.paid) this.require(ctx, "bills.manage");
    const cafeId = ctx.cafe.id;
    const existing = await this.store.findBillByKey(cafeId, input.key);
    if (existing) return this.dto(ctx, existing);
    const today = await this.today(cafeId);
    const fields = await this.fields(ctx, input, today, null);
    const now = this.now();
    const bill: Bill = {
      id: `bil_${randomUUID()}`,
      cafeId,
      ...fields,
      paidKurus: 0,
      paidAt: null,
      payments: [],
      version: 1,
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      createdById: ctx.member.id,
      createdAt: now,
      updatedAt: now,
      createKey: input.key,
    };
    if (input.paid) Object.assign(bill, { paidKurus: bill.totalKurus, paidAt: now });
    const saved = await this.atomically(async () => {
      const again = await this.store.findBillByKey(cafeId, input.key);
      if (again) return again;
      await this.store.saveBill(bill);
      if (input.paid) await this.store.addPayment(this.payment(ctx, bill, bill.totalKurus, input.paid.method, today));
      await this.moveStock(ctx, bill, `bill:${bill.id}:1`, billStock(bill.lines));
      await this.reprice(cafeId, billStock(bill.lines).keys());
      return bill;
    });
    return this.dto(ctx, (await this.store.getBill(cafeId, saved.id))!);
  }

  /**
   * "Düzelt": the bill as it should have been. Stock moves by the difference only, and the
   * prices of every item it touches are worked out again. A paid bill has to be unpaid first.
   */
  async correct(ctx: StaffContext, billId: string, input: BillInput & { version: number }): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    const cafeId = ctx.cafe.id;
    const before = await this.bill(ctx, billId);
    this.editable(before, input.version);
    const fields = await this.fields(ctx, input, await this.today(cafeId), before);
    await this.atomically(async () => {
      const current = await this.bill(ctx, billId);
      this.editable(current, input.version);
      const next: Bill = { ...current, ...fields, version: current.version + 1, updatedAt: this.now() };
      await this.store.saveBill(next);
      const previous = billStock(current.lines);
      await this.moveStock(ctx, next, `bill:${billId}:${next.version}`, stockDifference(previous, billStock(next.lines)));
      await this.reprice(cafeId, new Set([...previous.keys(), ...billStock(next.lines).keys()]));
    });
    return this.get(ctx, billId);
  }

  /** "İptal et": the stock it added goes back out and it stops counting as owed. Kept, with why. */
  async void(ctx: StaffContext, billId: string, input: { reason: string }): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    const reason = input.reason.trim();
    if (!reason) throw new AppError("REASON_REQUIRED", "Say why", 400);
    await this.atomically(async () => {
      const bill = await this.bill(ctx, billId);
      if (bill.voidedAt) return;
      if (bill.paidKurus > 0) throw new AppError("BILL_PAID", "Undo its payment first", 409);
      await this.store.saveBill({ ...bill, voidedAt: this.now(), voidedById: ctx.member.id, voidReason: reason, updatedAt: this.now() });
      const added = billStock(bill.lines);
      await this.moveStock(ctx, bill, `bill:${billId}:void`, new Map([...added].map(([id, milli]) => [id, -milli])));
      await this.reprice(ctx.cafe.id, added.keys());
    });
    return this.get(ctx, billId);
  }

  /** "Ödendi": what is left of it, by cash, card or bank transfer, today unless another day is given. */
  async pay(ctx: StaffContext, billId: string, input: { method: BillPayMethod; paidOn?: string }): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    const today = await this.today(ctx.cafe.id);
    await this.atomically(async () => {
      const bill = await this.bill(ctx, billId);
      if (bill.voidedAt) throw new AppError("BILL_VOIDED", "This bill was voided", 409);
      if (bill.paidAt) return;
      const paidOn = input.paidOn ?? today;
      if (!validDate(paidOn) || paidOn > today || paidOn < bill.date) throw new AppError("PAID_ON_INVALID", "Check the day it was paid", 400);
      await this.store.addPayment(this.payment(ctx, bill, bill.totalKurus - bill.paidKurus, input.method, paidOn));
      await this.store.saveBill({ ...bill, paidKurus: bill.totalKurus, paidAt: this.now(), updatedAt: this.now() });
    });
    return this.get(ctx, billId);
  }

  /** "Ödemeyi geri al": marked paid by mistake. */
  async unpay(ctx: StaffContext, billId: string): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    await this.atomically(async () => {
      const bill = await this.bill(ctx, billId);
      if (bill.paidKurus === 0) return;
      await this.store.removePayments(ctx.cafe.id, billId);
      await this.store.saveBill({ ...bill, paidKurus: 0, paidAt: null, updatedAt: this.now() });
    });
    return this.get(ctx, billId);
  }

  /** What is owed across all bills, for Bugün. */
  async owed(cafeId: string): Promise<BillsDTO["owed"]> {
    return owedSum(await this.store.listBills(cafeId, { unpaid: true }), await this.today(cafeId));
  }

  // ─────────────────────────────────────────────── Tedarikçiler

  async suppliers(ctx: StaffContext): Promise<SuppliersDTO> {
    this.require(ctx, "suppliers.view");
    const cafeId = ctx.cafe.id;
    const today = await this.today(cafeId);
    const since = localDateKey(new Date(this.now().getTime() - 30 * DAY_MS), await this.timeZone(cafeId));
    const [suppliers, owed, recent] = await Promise.all([
      this.store.listSuppliers(cafeId, { includeArchived: true }),
      this.store.listBills(cafeId, { unpaid: true }),
      this.store.listBills(cafeId, { from: since }),
    ]);
    const last = new Map(
      await Promise.all(suppliers.map(async (s) => [s.id, (await this.store.listBills(cafeId, { supplierId: s.id, limit: 1 }))[0]?.date ?? null] as const)),
    );
    const dto = (s: Supplier): SupplierSummaryDTO => {
      const mine = owed.filter((b) => b.supplierId === s.id);
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        ...owedKurus(mine, today),
        lastBillDate: last.get(s.id) ?? null,
        monthKurus: recent.filter((b) => b.supplierId === s.id).reduce((sum, b) => sum + b.totalKurus, 0),
      };
    };
    const live = suppliers.filter((s) => !s.archivedAt).map(dto);
    return {
      suppliers: live.sort((a, b) => b.owedKurus - a.owedKurus || a.name.localeCompare(b.name, "tr")),
      removed: suppliers.filter((s) => s.archivedAt).map(dto),
      owedKurus: live.reduce((sum, s) => sum + s.owedKurus, 0),
      canEdit: ctx.permissions.has("suppliers.edit"),
    };
  }

  /** One supplier: their details, what you owe them, their bills, and how their prices moved. */
  async supplier(ctx: StaffContext, supplierId: string): Promise<SupplierDTO> {
    this.require(ctx, "suppliers.view");
    const cafeId = ctx.cafe.id;
    const s = await this.findSupplier(ctx, supplierId);
    const [today, bills, owed, all, items] = await Promise.all([
      this.today(cafeId),
      this.store.listBills(cafeId, { supplierId, includeVoided: true, limit: SUPPLIER_BILLS }),
      this.store.listBills(cafeId, { supplierId, unpaid: true }),
      this.store.listBills(cafeId, { supplierId }),
      this.stock.listItems(cafeId, { includeArchived: true }),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const prices = new Map<string, SupplierPriceDTO>();
    for (const b of all) {
      for (const l of b.lines) {
        const item = l.itemId ? byId.get(l.itemId) : undefined;
        const cost = unitCost(l);
        if (!item || cost === null || l.totalKurus === 0) continue;
        const p = prices.get(item.id) ?? { itemId: item.id, name: item.name, unit: item.unit, points: [] };
        if (p.points.length < PRICE_POINTS) p.points.push({ date: b.date, unitKurus: cost, billId: b.id });
        prices.set(item.id, p);
      }
    }
    return {
      supplier: { id: s.id, name: s.name, phone: s.phone, email: s.email, taxNo: s.taxNo, iban: s.iban, note: s.note, removed: !!s.archivedAt },
      ...owedKurus(owed, today),
      bills: bills.map((b) => summary(b, new Map([[s.id, s.name]]), today)),
      prices: [...prices.values()].sort((a, b) => a.name.localeCompare(b.name, "tr")),
      canEdit: ctx.permissions.has("suppliers.edit"),
      canSeeBills: ctx.permissions.has("bills.view"),
    };
  }

  /** "Tedarikçi ekle". The same `key` twice adds one. */
  async addSupplier(ctx: StaffContext, input: SupplierInput & { key: string; name: string }): Promise<SupplierDTO> {
    this.require(ctx, "suppliers.edit");
    const cafeId = ctx.cafe.id;
    // The key decides the id, so a retried tap finds the first one.
    const id = `sup_${createHash("sha256").update(`${cafeId}:${input.key}`).digest("hex").slice(0, 24)}`;
    if (await this.store.getSupplier(cafeId, id)) return this.supplier(ctx, id);
    const s: Supplier = {
      id,
      cafeId,
      name: "",
      phone: null,
      email: null,
      taxNo: null,
      iban: null,
      note: null,
      archivedAt: null,
      createdAt: this.now(),
      ...cleanSupplier(input),
    };
    this.checkSupplier(s);
    await this.uniqueSupplier(cafeId, s.name, null);
    await this.store.saveSupplier(s);
    return this.supplier(ctx, id);
  }

  /** Changes only what was sent. `removed` hides it from new bills; its bills stay as they are. */
  async updateSupplier(ctx: StaffContext, supplierId: string, input: SupplierInput & { removed?: boolean }): Promise<SupplierDTO> {
    this.require(ctx, "suppliers.edit");
    const current = await this.findSupplier(ctx, supplierId);
    const next: Supplier = { ...current, ...cleanSupplier(input) };
    if (input.removed === true && !current.archivedAt) next.archivedAt = this.now();
    if (input.removed === false) next.archivedAt = null;
    this.checkSupplier(next);
    if (!next.archivedAt && (next.name !== current.name || current.archivedAt)) await this.uniqueSupplier(ctx.cafe.id, next.name, supplierId);
    await this.store.saveSupplier(next);
    return this.supplier(ctx, supplierId);
  }

  // ─────────────────────────────────────────────── helpers

  /** Checks and tidies what a bill says. `before` is the bill being corrected, whose removed items and supplier may stay. */
  private async fields(ctx: StaffContext, input: BillInput, today: string, before: Bill | null) {
    const cafeId = ctx.cafe.id;
    if (!validDate(input.date) || input.date > today) throw new AppError("BILL_DATE_INVALID", "Check the date", 400);
    const dueDate = input.dueDate || null;
    if (dueDate && (!validDate(dueDate) || dueDate < input.date)) throw new AppError("BILL_DUE_INVALID", "The due date is before the bill's date", 400);
    if (input.supplierId) {
      const s = await this.store.getSupplier(cafeId, input.supplierId);
      if (!s || (s.archivedAt && before?.supplierId !== s.id)) throw new AppError("SUPPLIER_NOT_FOUND", "No such supplier", 404);
    }
    if (input.lines.length === 0 || input.lines.length > 50) throw new AppError("BILL_LINE_INVALID", "Check the lines", 400);
    const items = new Map((await this.stock.listItems(cafeId, { includeArchived: true })).map((i) => [i.id, i]));
    const kept = new Set(before?.lines.map((l) => l.itemId) ?? []);
    const lines: BillLine[] = input.lines.map((l) => {
      if (!Number.isInteger(l.totalKurus) || l.totalKurus < 0 || l.totalKurus > 100_000_000) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
      if (l.itemId) {
        const item = items.get(l.itemId);
        if (!item || (item.archivedAt && !kept.has(item.id))) throw new AppError("STOCK_ITEM_NOT_FOUND", "No such stock item", 404);
        if (!l.qtyMilli || !Number.isInteger(l.qtyMilli) || l.qtyMilli <= 0 || l.qtyMilli > 1_000_000_000) {
          throw new AppError("BILL_LINE_INVALID", "A stock line needs an amount", 400);
        }
        return { itemId: item.id, name: item.name, category: categoryOf(item), qtyMilli: l.qtyMilli, totalKurus: l.totalKurus };
      }
      const name = l.name?.trim() ?? "";
      if (!name || name.length > 80 || !l.category) throw new AppError("BILL_LINE_INVALID", "Say what the line was for", 400);
      return { itemId: null, name, category: l.category, qtyMilli: null, totalKurus: l.totalKurus };
    });
    const stockIds = lines.flatMap((l) => (l.itemId ? [l.itemId] : []));
    if (new Set(stockIds).size !== stockIds.length) throw new AppError("BILL_LINE_DUPLICATE", "Each item once per bill", 400);
    const totalKurus = billTotal(lines);
    if (totalKurus <= 0) throw new AppError("BILL_TOTAL_ZERO", "The bill's total can't be zero", 400);
    return {
      supplierId: input.supplierId,
      number: input.number?.trim() || null,
      date: input.date,
      dueDate,
      note: input.note?.trim() || null,
      lines,
      totalKurus,
    };
  }

  private editable(bill: Bill, version: number): void {
    if (bill.voidedAt) throw new AppError("BILL_VOIDED", "This bill was voided", 409);
    if (bill.paidKurus > 0) throw new AppError("BILL_PAID", "Undo its payment first", 409);
    if (bill.version !== version) throw new AppError("BILL_CHANGED", "Someone changed this bill; open it again", 409);
  }

  private async moveStock(ctx: StaffContext, bill: Bill, batchKey: string, changes: Map<string, number>): Promise<void> {
    if (changes.size === 0) return;
    const supplier = bill.supplierId ? await this.store.getSupplier(bill.cafeId, bill.supplierId) : null;
    await this.stock.applyBatch({
      cafeId: bill.cafeId,
      batchKey,
      reason: "bill",
      note: [supplier?.name, bill.number && `#${bill.number}`].filter(Boolean).join(" · ") || null,
      memberId: ctx.member.id,
      at: this.now(),
      changes: [...changes].map(([itemId, changeMilli]) => ({ id: `smv_${randomUUID()}`, itemId, changeMilli })),
    });
  }

  /** Each item's price from its latest priced bill. An item no bill prices keeps what was typed on Stok. */
  private async reprice(cafeId: string, itemIds: Iterable<string>): Promise<void> {
    for (const itemId of new Set(itemIds)) {
      const last = await this.store.lastPrice(cafeId, itemId);
      const cost = last && unitCost(last);
      const item = await this.stock.getItem(cafeId, itemId);
      if (item && cost !== null && cost !== item.costKurus) await this.stock.saveItem({ ...item, costKurus: cost });
    }
  }

  private payment(ctx: StaffContext, bill: Bill, amountKurus: number, method: BillPayMethod, paidOn: string) {
    return { id: `bpy_${randomUUID()}`, cafeId: bill.cafeId, billId: bill.id, amountKurus, method, paidOn, memberId: ctx.member.id, createdAt: this.now() };
  }

  private async dto(ctx: StaffContext, bill: Bill): Promise<BillDTO> {
    const cafeId = ctx.cafe.id;
    const [today, supplier, items] = await Promise.all([
      this.today(cafeId),
      bill.supplierId ? this.store.getSupplier(cafeId, bill.supplierId) : null,
      this.stock.listItems(cafeId, { includeArchived: true }),
    ]);
    const units = new Map(items.map((i) => [i.id, i.unit]));
    const names = await this.names([bill.createdById, bill.voidedById, ...bill.payments.map((p) => p.memberId)]);
    return {
      ...summary(bill, new Map(supplier ? [[supplier.id, supplier.name]] : []), today),
      lines: bill.lines.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        category: l.category,
        qtyMilli: l.qtyMilli,
        unit: l.itemId ? (units.get(l.itemId) ?? null) : null,
        totalKurus: l.totalKurus,
        unitKurus: unitCost(l),
      })),
      note: bill.note,
      version: bill.version,
      createdBy: names.get(bill.createdById) ?? null,
      createdAt: bill.createdAt.toISOString(),
      payments: bill.payments.map((p) => ({ amountKurus: p.amountKurus, method: p.method, paidOn: p.paidOn, by: names.get(p.memberId) ?? null })),
      voidedAt: bill.voidedAt?.toISOString() ?? null,
      voidedBy: bill.voidedById ? (names.get(bill.voidedById) ?? null) : null,
      voidReason: bill.voidReason,
      canManage: ctx.permissions.has("bills.manage"),
    };
  }

  private async bill(ctx: StaffContext, billId: string): Promise<Bill> {
    const bill = await this.store.getBill(ctx.cafe.id, billId);
    if (!bill) throw new AppError("BILL_NOT_FOUND", "No such bill", 404);
    return bill;
  }

  private async findSupplier(ctx: StaffContext, supplierId: string): Promise<Supplier> {
    const s = await this.store.getSupplier(ctx.cafe.id, supplierId);
    if (!s) throw new AppError("SUPPLIER_NOT_FOUND", "No such supplier", 404);
    return s;
  }

  private async uniqueSupplier(cafeId: string, name: string, self: string | null): Promise<void> {
    const live = await this.store.listSuppliers(cafeId);
    if (live.some((s) => s.id !== self && sameMenuName(s.name, name))) throw new AppError("SUPPLIER_EXISTS", "There is already a supplier with this name", 409);
  }

  private checkSupplier(s: Supplier): void {
    const problem = supplierProblem(s);
    if (!problem) return;
    const code = problem === "NAME_EMPTY" ? "NAME_REQUIRED" : problem === "NAME_TOO_LONG" ? "SUPPLIER_NAME_TOO_LONG" : problem;
    throw new AppError(code, "Check the supplier's details", 400);
  }

  private async timeZone(cafeId: string): Promise<string> {
    return (await this.directory.getSettings(cafeId)).timeZone;
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), await this.timeZone(cafeId));
  }

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}

function categoryOf(item: StockItem): BillCategory {
  return item.kind === "supply" ? "supplies" : "ingredients";
}

/** Only the fields that were sent, tidied: empty text is null, spaces out of numbers. */
function cleanSupplier(input: SupplierInput): Partial<Supplier> {
  const text = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const out: Partial<Supplier> = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.phone !== undefined) out.phone = text(input.phone);
  if (input.email !== undefined) out.email = text(input.email)?.toLowerCase() ?? null;
  if (input.taxNo !== undefined) out.taxNo = text(input.taxNo)?.replace(/\s/g, "") ?? null;
  if (input.iban !== undefined) out.iban = input.iban?.trim() ? compactIban(input.iban) : null;
  if (input.note !== undefined) out.note = text(input.note);
  return out;
}

function summary(b: Bill, supplierNames: Map<string, string>, today: string): BillSummaryDTO {
  return {
    id: b.id,
    supplierId: b.supplierId,
    supplierName: b.supplierId ? (supplierNames.get(b.supplierId) ?? null) : null,
    number: b.number,
    date: b.date,
    dueDate: b.dueDate,
    totalKurus: b.totalKurus,
    paidKurus: b.paidKurus,
    state: billState(b, today),
    summary: b.lines.map((l) => l.name).join(", "),
    lineCount: b.lines.length,
    stock: b.lines.some((l) => l.itemId),
  };
}

function owedKurus(bills: Bill[], today: string): { owedKurus: number; overdueKurus: number } {
  let owed = 0;
  let overdue = 0;
  for (const b of bills) {
    const left = b.totalKurus - b.paidKurus;
    owed += left;
    if (billState(b, today) === "overdue") overdue += left;
  }
  return { owedKurus: owed, overdueKurus: overdue };
}

function owedSum(bills: Bill[], today: string): BillsDTO["owed"] {
  const { owedKurus: totalKurus, overdueKurus } = owedKurus(bills, today);
  return { count: bills.length, totalKurus, overdueCount: bills.filter((b) => billState(b, today) === "overdue").length, overdueKurus };
}
