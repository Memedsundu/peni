import type { BillDTO, BillPaymentDTO, BillsDTO, BillSummaryDTO, PayOptionsDTO, SupplierDTO, SupplierPriceDTO, SuppliersDTO, SupplierSummaryDTO } from "@peni/api";
import {
  KDV_RATES,
  billNumberKey,
  billState,
  billStock,
  billTotal,
  compactIban,
  lenderKey,
  localDateKey,
  sameMenuName,
  STOCK_UNITS,
  stockDifference,
  stockItemProblem,
  supplierProblem,
  unitCost,
  validDate,
  type Bill,
  type AssistantStore,
  type BillCategory,
  type BillKdv,
  type BillLine,
  type BillPayment,
  type BillPayMethod,
  type BillStore,
  type DebtStore,
  type PeniDirectory,
  type Permission,
  type StaffStore,
  type StockItem,
  type StockKind,
  type StockStore,
  type StockUnit,
  type Supplier,
} from "@peni/core";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { StaffContext } from "./staff";

const DAY_MS = 86_400_000;
/** Bills a supplier page lists, and price points per item. */
const SUPPLIER_BILLS = 50;
const PRICE_POINTS = 12;

export interface BillLineInput {
  itemId: string | null;
  /**
   * Adding a bill: a stock item to create for this line and add its amount to, when the café
   * doesn't keep it yet ("Yeni stok kalemi"). Needs "stock.edit". A live item with the same
   * name is used instead of a second one.
   */
  newItem?: { name: string; unit: StockUnit; kind: StockKind } | null;
  name?: string;
  category?: BillCategory;
  qtyMilli?: number | null;
  totalKurus: number;
  /** Confirming a draft (piece 25): which of its read lines this is. Bills ignore it. */
  from?: number;
}

export interface BillInput {
  supplierId: string | null;
  number?: string | null;
  date: string;
  dueDate?: string | null;
  note?: string | null;
  lines: BillLineInput[];
  /** The KDV printed on it, per rate (piece 25). */
  kdv?: BillKdv[];
}

export interface PayInput {
  key: string;
  method: BillPayMethod;
  /** The rest of the bill when left out. */
  amountKurus?: number;
  paidOn?: string;
  check?: { number: string; bankName?: string | null; dueDate: string };
  lender?: { memberId?: string | null; name?: string };
  loanDueDate?: string | null;
  /** Cash from the drawer or the reserve (piece 20). */
  from?: "drawer" | "reserve";
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
    /** Checks and loans a payment writes (piece 19). */
    private readonly debts: DebtStore,
    /** Where cash and bank payments come out of, and which months are closed (piece 20). */
    private readonly money: MoneyService,
    /** Runs the bill, its stock moves and the prices together (the ledger's transaction). */
    private readonly atomically: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly now: () => Date,
    /** Scanning (piece 25): whether the assistant reads, and the scans bills were confirmed from. */
    private readonly scans: { mode: () => "on" | "demo" | "off"; documents: Pick<AssistantStore, "getDocumentInfo"> } = {
      mode: () => "off",
      documents: { getDocumentInfo: async () => null },
    },
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
      canAddStock: ctx.permissions.has("stock.edit"),
      canScan: ctx.permissions.has("bills.add") && this.scans.mode() !== "off",
      canSeeDrafts: ctx.permissions.has("assistant.use"),
    };
  }

  async get(ctx: StaffContext, billId: string): Promise<BillDTO> {
    this.require(ctx, "bills.view");
    return this.dto(ctx, await this.bill(ctx, billId));
  }

  /**
   * "Fatura ekle". Stock lines add their amount to the item and set its price, unless a
   * newer bill already priced it. The same `key` twice adds it once. `paid` marks it paid
   * on the spot, which needs "bills.manage": today unless `paidOn` says another day since
   * the bill's, and by the café's credit card too (piece 28, "debts.card"). A number the
   * supplier's bills already have stops it (piece 25's duplicate guard) unless
   * `allowDuplicate` says it's another bill.
   */
  async add(
    ctx: StaffContext,
    input: BillInput & {
      key: string;
      paid?: { method: "cash" | "card" | "bank" | "credit"; from?: "drawer" | "reserve"; paidOn?: string };
      allowDuplicate?: boolean;
      /** The scan it was confirmed from; only the assistant sets it. */
      documentId?: string | null;
      /**
       * With no `supplierId`: a supplier to add for this bill ("Yeni tedarikçi"), as the bill
       * showed it or the person corrected it. Needs "suppliers.edit". It's checked with the bill
       * and written with it, so a bill that can't be added leaves no supplier behind; a live
       * supplier with the same name is used instead.
       */
      newSupplier?: SupplierInput & { name: string };
    },
  ): Promise<BillDTO> {
    this.require(ctx, "bills.add");
    if (input.paid) {
      this.require(ctx, "bills.manage");
      this.requireFor(ctx, input.paid.method);
    }
    const cafeId = ctx.cafe.id;
    const existing = await this.store.findBillByKey(cafeId, input.key);
    if (existing) return this.dto(ctx, existing);
    const today = await this.today(cafeId);
    const supplier = await this.newSupplier(ctx, input.key, input.supplierId, input.newSupplier);
    const supplierId = supplier ? supplier.id : input.supplierId;
    const { lines, created } = await this.newItems(ctx, input.key, input.lines);
    const fields = await this.fields(ctx, { ...input, supplierId, lines }, today, null, created, supplier?.fresh ?? null);
    await this.money.assertOpen(cafeId, fields.date);
    const paidOn = input.paid?.paidOn ?? today;
    if (input.paid) {
      if (!validDate(paidOn) || paidOn > today || paidOn < fields.date) throw new AppError("PAID_ON_INVALID", "Check the day it was paid", 400);
      await this.money.assertOpen(cafeId, paidOn);
      if (input.paid.method === "credit" && !(await this.debts.getCard(cafeId))) throw new AppError("CARD_NOT_SET", "Set up the credit card first", 409);
    }
    if (!input.allowDuplicate && (await this.sameNumber(cafeId, fields.supplierId, fields.number))) {
      throw new AppError("BILL_DUPLICATE", "This supplier already has a bill with this number", 409);
    }
    const now = this.now();
    const bill: Bill = {
      id: `bil_${randomUUID()}`,
      cafeId,
      ...fields,
      documentId: input.documentId ?? null,
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
      // The money moves first: an empty drawer stops it before anything is written.
      const account = input.paid ? await this.money.accountFor(ctx, input.paid.method, input.paid.from, paidOn) : null;
      const payment = input.paid ? this.payment(ctx, bill, bill.totalKurus, input.paid.method, paidOn, account) : null;
      if (payment) {
        await this.money.post(ctx, { source: `bill_payment:${payment.id}`, account, amountKurus: -payment.amountKurus, kind: "bill", day: paidOn, label: await this.label(bill) });
      }
      // A new supplier, and new stock items at nothing (the bill's own move below adds what came).
      if (supplier?.fresh && !(await this.store.getSupplier(cafeId, supplier.id))) await this.store.saveSupplier(supplier.fresh);
      for (const item of created) if (!(await this.stock.getItem(cafeId, item.id))) await this.stock.saveItem(item);
      await this.store.saveBill(bill);
      if (payment) await this.store.addPayment(payment);
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
    if (input.lines.some((l) => l.newItem)) throw new AppError("BILL_LINE_INVALID", "Add new stock items on Stok first", 400);
    const cafeId = ctx.cafe.id;
    const before = await this.bill(ctx, billId);
    this.editable(before, input.version);
    const fields = await this.fields(ctx, input, await this.today(cafeId), before);
    await this.money.assertOpen(cafeId, before.date, fields.date);
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
      await this.money.assertOpen(ctx.cafe.id, bill.date);
      if (bill.paidKurus > 0) throw new AppError("BILL_PAID", "Undo its payment first", 409);
      await this.store.saveBill({ ...bill, voidedAt: this.now(), voidedById: ctx.member.id, voidReason: reason, updatedAt: this.now() });
      const added = billStock(bill.lines);
      await this.moveStock(ctx, bill, `bill:${billId}:void`, new Map([...added].map(([id, milli]) => [id, -milli])));
      await this.reprice(ctx.cafe.id, added.keys());
    });
    return this.get(ctx, billId);
  }

  /**
   * "Öde": all that is left of it, or part of it. Cash, card and bank settle that part;
   * "credit" puts it on the credit card, "check" writes a check due later, "loan" makes it
   * owed to whoever paid it. Either way the bill counts it as paid, and Borçlar shows what
   * is owed instead. The same `key` twice pays once.
   */
  async pay(ctx: StaffContext, billId: string, input: PayInput): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    this.requireFor(ctx, input.method);
    const cafeId = ctx.cafe.id;
    const id = `bpy_${keyHash(cafeId, input.key)}`;
    const today = await this.today(cafeId);
    await this.atomically(async () => {
      if (await this.store.getPayment(cafeId, id)) return;
      const bill = await this.bill(ctx, billId);
      if (bill.voidedAt) throw new AppError("BILL_VOIDED", "This bill was voided", 409);
      const left = bill.totalKurus - bill.paidKurus;
      const amountKurus = input.amountKurus ?? left;
      if (amountKurus > left || left <= 0) throw new AppError("BILL_OVERPAY", "That's more than is left of it", 409);
      if (!Number.isInteger(amountKurus) || amountKurus <= 0) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
      const paidOn = input.paidOn ?? today;
      if (!validDate(paidOn) || paidOn > today || paidOn < bill.date) throw new AppError("PAID_ON_INVALID", "Check the day it was paid", 400);
      await this.money.assertOpen(cafeId, paidOn);
      const account = await this.money.accountFor(ctx, input.method, input.from, paidOn);
      const payment: BillPayment = { id, cafeId, billId, amountKurus, method: input.method, paidOn, account, memberId: ctx.member.id, createdAt: this.now() };
      const debt = await this.debtFor(ctx, bill, payment, input);
      await this.money.post(ctx, { source: `bill_payment:${id}`, account, amountKurus: -amountKurus, kind: "bill", day: paidOn, label: await this.label(bill) });
      await this.store.addPayment(payment);
      if (debt?.check) await this.debts.saveCheck(debt.check);
      if (debt?.loan) await this.debts.saveLoan(debt.loan);
      const paidKurus = bill.paidKurus + amountKurus;
      await this.store.saveBill({ ...bill, paidKurus, paidAt: paidKurus === bill.totalKurus ? this.now() : null, updatedAt: this.now() });
    });
    return this.get(ctx, billId);
  }

  /**
   * "Geri al": one payment, made by mistake. The check or debt it made goes with it,
   * unless the check was cashed or the debt paid back (undo those first).
   */
  async removePayment(ctx: StaffContext, billId: string, paymentId: string): Promise<BillDTO> {
    this.require(ctx, "bills.manage");
    const cafeId = ctx.cafe.id;
    const found = await this.store.getPayment(cafeId, paymentId);
    if (!found || found.billId !== billId) throw new AppError("PAYMENT_NOT_FOUND", "No such payment", 404);
    this.requireFor(ctx, found.method);
    await this.atomically(async () => {
      const payment = await this.store.getPayment(cafeId, paymentId);
      if (!payment) return;
      await this.money.assertOpen(cafeId, payment.paidOn);
      const locked = await this.locked(payment);
      if (locked) throw new AppError(locked, locked === "CHECK_CASHED" ? "The check was cashed" : "Some of it was paid back", 409);
      await this.money.unpost(ctx, `bill_payment:${payment.id}`, await this.label(await this.bill(ctx, billId)));
      const check = await this.debts.findCheckByPayment(cafeId, payment.id);
      if (check) await this.debts.removeCheck(cafeId, check.id);
      const loan = await this.debts.findLoanByPayment(cafeId, payment.id);
      if (loan) await this.debts.removeLoan(cafeId, loan.id);
      await this.store.removePayment(cafeId, payment.id);
      const bill = await this.bill(ctx, billId);
      await this.store.saveBill({ ...bill, paidKurus: bill.paidKurus - payment.amountKurus, paidAt: null, updatedAt: this.now() });
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
    const id = `sup_${keyHash(cafeId, input.key)}`;
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

  /**
   * The supplier a new bill adds ("Yeni tedarikçi"), checked but not yet written: `fresh` is
   * set when it has to be created. Its id comes from the bill's key, so adding the same bill
   * again finds the same supplier; a live supplier of the same name is used instead.
   */
  private async newSupplier(
    ctx: StaffContext,
    key: string,
    supplierId: string | null,
    input: (SupplierInput & { name: string }) | undefined,
  ): Promise<{ id: string; fresh: Supplier | null } | null> {
    if (supplierId || !input) return null;
    const cafeId = ctx.cafe.id;
    const id = `sup_${keyHash(cafeId, `draft:${key}`)}`;
    if (await this.store.getSupplier(cafeId, id)) return { id, fresh: null };
    const same = (await this.store.listSuppliers(cafeId)).find((s) => sameMenuName(s.name, input.name));
    if (same) return { id: same.id, fresh: null };
    this.require(ctx, "suppliers.edit");
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
    return { id, fresh: s };
  }

  /**
   * The stock items a new bill's lines start (piece 25's "Yeni stok kalemi"), checked, and the
   * lines pointing at them. An item is named once: a live item of the same name is used, and
   * its id comes from the bill's key, so adding the same bill again finds the same item.
   */
  private async newItems(ctx: StaffContext, key: string, input: BillLineInput[]): Promise<{ lines: BillLineInput[]; created: StockItem[] }> {
    if (!input.some((l) => l.newItem && !l.itemId)) return { lines: input, created: [] };
    this.require(ctx, "stock.edit");
    const cafeId = ctx.cafe.id;
    const live = await this.stock.listItems(cafeId);
    const created: StockItem[] = [];
    const lines = input.map((l, i) => {
      if (!l.newItem || l.itemId) return l;
      const { newItem, ...line } = l;
      const name = newItem.name.replace(/\s+/g, " ").trim();
      if (!STOCK_UNITS.includes(newItem.unit) || (newItem.kind !== "ingredient" && newItem.kind !== "supply")) {
        throw new AppError("BILL_LINE_INVALID", "Check the new stock item", 400);
      }
      const same = [...live, ...created].find((x) => sameMenuName(x.name, name));
      if (same) return { ...line, itemId: same.id };
      const item: StockItem = {
        id: `stk_${keyHash(cafeId, `${key}:new:${i}`)}`,
        cafeId,
        name,
        kind: newItem.kind,
        unit: newItem.unit,
        qtyMilli: 0,
        minMilli: 0,
        costKurus: null,
        archivedAt: null,
        createdAt: this.now(),
      };
      const problem = stockItemProblem(item);
      if (problem) throw new AppError(problem === "NAME_TOO_LONG" ? "NAME_TOO_LONG" : "NAME_REQUIRED", "Check the new stock item's name", 400);
      created.push(item);
      return { ...line, itemId: item.id };
    });
    return { lines, created };
  }

  /**
   * Checks and tidies what a bill says. `before` is the bill being corrected, whose removed
   * items and supplier may stay; `created` are stock items this bill is about to add.
   */
  private async fields(ctx: StaffContext, input: BillInput, today: string, before: Bill | null, created: StockItem[] = [], pending: Supplier | null = null) {
    const cafeId = ctx.cafe.id;
    if (!validDate(input.date) || input.date > today) throw new AppError("BILL_DATE_INVALID", "Check the date", 400);
    const dueDate = input.dueDate || null;
    if (dueDate && (!validDate(dueDate) || dueDate < input.date)) throw new AppError("BILL_DUE_INVALID", "The due date is before the bill's date", 400);
    if (input.supplierId && input.supplierId !== pending?.id) {
      const s = await this.store.getSupplier(cafeId, input.supplierId);
      if (!s || (s.archivedAt && before?.supplierId !== s.id)) throw new AppError("SUPPLIER_NOT_FOUND", "No such supplier", 404);
    }
    if (input.lines.length === 0 || input.lines.length > 50) throw new AppError("BILL_LINE_INVALID", "Check the lines", 400);
    const items = new Map([...(await this.stock.listItems(cafeId, { includeArchived: true })), ...created].map((i) => [i.id, i]));
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
    const kdv = [...(input.kdv ?? [])].sort((a, b) => a.ratePct - b.ratePct);
    const kdvOk =
      kdv.every((k) => KDV_RATES.includes(k.ratePct) && Number.isInteger(k.amountKurus) && k.amountKurus > 0) &&
      new Set(kdv.map((k) => k.ratePct)).size === kdv.length &&
      kdv.reduce((sum, k) => sum + k.amountKurus, 0) < totalKurus;
    if (!kdvOk) throw new AppError("KDV_INVALID", "Check the KDV", 400);
    return {
      supplierId: input.supplierId,
      number: input.number?.trim() || null,
      date: input.date,
      dueDate,
      note: input.note?.trim() || null,
      lines,
      totalKurus,
      kdv: kdv.map((k) => ({ ratePct: k.ratePct, amountKurus: k.amountKurus })),
    };
  }

  /** A live bill from the same supplier with the same number ("A-20511" and "A20511" are one). */
  async sameNumber(cafeId: string, supplierId: string | null, number: string | null): Promise<Bill | null> {
    const key = billNumberKey(number);
    if (!supplierId || !key) return null;
    return (await this.store.listBills(cafeId, { supplierId })).find((b) => !b.voidedAt && billNumberKey(b.number) === key) ?? null;
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

  private payment(ctx: StaffContext, bill: Bill, amountKurus: number, method: BillPayMethod, paidOn: string, account: BillPayment["account"]): BillPayment {
    return { id: `bpy_${randomUUID()}`, cafeId: bill.cafeId, billId: bill.id, amountKurus, method, paidOn, account, memberId: ctx.member.id, createdAt: this.now() };
  }

  /** How a bill's money shows at Kasa: "Fatura · Süt Dünyası". */
  private async label(bill: Bill): Promise<string> {
    const supplier = bill.supplierId ? await this.store.getSupplier(bill.cafeId, bill.supplierId) : null;
    return ["Fatura", supplier?.name ?? bill.lines[0]?.name].filter(Boolean).join(" · ");
  }

  /** Paying by card, check or loan also needs the right to make that debt. */
  private requireFor(ctx: StaffContext, method: BillPayMethod): void {
    if (method === "credit") this.require(ctx, "debts.card");
    if (method === "check" || method === "loan") this.require(ctx, "debts.edit");
  }

  /** The check or loan a payment makes, checked; nothing for cash, card or bank. */
  private async debtFor(ctx: StaffContext, bill: Bill, payment: BillPayment, input: PayInput) {
    const base = { cafeId: bill.cafeId, amountKurus: payment.amountKurus, billPaymentId: payment.id, note: null, createdById: ctx.member.id, createdAt: payment.createdAt };
    const tail = payment.id.slice(4);
    if (payment.method === "credit") {
      if (!(await this.debts.getCard(bill.cafeId))) throw new AppError("CARD_NOT_SET", "Set up the credit card first", 409);
    }
    if (payment.method === "check") {
      const number = input.check?.number.trim() ?? "";
      if (!number || number.length > 30) throw new AppError("CHECK_NUMBER_REQUIRED", "Type the check's number", 400);
      const dueDate = input.check!.dueDate;
      if (!validDate(dueDate) || dueDate < payment.paidOn) throw new AppError("CHECK_DUE_INVALID", "The check's date is before the day it was written", 400);
      return {
        check: {
          ...base, id: `chk_${tail}`, number, bankName: input.check!.bankName?.trim() || null, payee: null, supplierId: bill.supplierId,
          writtenOn: payment.paidOn, dueDate, cashedOn: null, cashedById: null,
        },
      };
    }
    if (payment.method === "loan") {
      const lender = await this.lender(ctx, input.lender);
      const dueDate = input.loanDueDate || null;
      if (dueDate && (!validDate(dueDate) || dueDate < payment.paidOn)) throw new AppError("LOAN_DUE_INVALID", "It can't be due before it was lent", 400);
      return { loan: { ...base, id: `lon_${tail}`, ...lender, borrowedOn: payment.paidOn, dueDate } };
    }
    return null;
  }

  /** A lender from the team (by member id) or anyone else by name. */
  async lender(ctx: StaffContext, input: { memberId?: string | null; name?: string } | undefined) {
    if (input?.memberId) {
      const member = await this.staff.getMember(input.memberId);
      const account = member && member.cafeId === ctx.cafe.id ? await this.staff.getAccount(member.accountId) : null;
      if (!member || !account) throw new AppError("LENDER_REQUIRED", "Pick who paid", 400);
      return { lenderKey: lenderKey({ memberId: member.id, name: account.name }), lenderMemberId: member.id, lenderName: account.name };
    }
    const name = input?.name?.trim().replace(/\s+/g, " ") ?? "";
    if (!name || name.length > 80) throw new AppError("LENDER_REQUIRED", "Pick or type who paid", 400);
    return { lenderKey: lenderKey({ memberId: null, name }), lenderMemberId: null, lenderName: name };
  }

  /** Why a payment can't be undone any more. */
  private async locked(payment: BillPayment): Promise<"CHECK_CASHED" | "LOAN_REPAID" | null> {
    if (payment.method === "check") {
      const check = await this.debts.findCheckByPayment(payment.cafeId, payment.id);
      if (check?.cashedOn) return "CHECK_CASHED";
    }
    if (payment.method === "loan") {
      const loan = await this.debts.findLoanByPayment(payment.cafeId, payment.id);
      if (loan) {
        const [loans, repaid] = await Promise.all([
          this.debts.listLoans(payment.cafeId, { lenderKey: loan.lenderKey }),
          this.debts.listRepayments(payment.cafeId, { lenderKey: loan.lenderKey }),
        ]);
        const borrowed = loans.reduce((s, l) => s + l.amountKurus, 0);
        if (repaid.reduce((s, r) => s + r.amountKurus, 0) > borrowed - loan.amountKurus) return "LOAN_REPAID";
      }
    }
    return null;
  }

  private async paymentDto(ctx: StaffContext, p: BillPayment, names: Map<string, string>, closedThrough: string | null): Promise<BillPaymentDTO> {
    const check = p.method === "check" ? await this.debts.findCheckByPayment(p.cafeId, p.id) : null;
    const loan = p.method === "loan" ? await this.debts.findLoanByPayment(p.cafeId, p.id) : null;
    const allowed = ctx.permissions.has("bills.manage") && (p.method !== "credit" || ctx.permissions.has("debts.card")) && (!(check || loan) || ctx.permissions.has("debts.edit"));
    return {
      id: p.id,
      amountKurus: p.amountKurus,
      method: p.method,
      paidOn: p.paidOn,
      by: names.get(p.memberId) ?? null,
      check: check && { id: check.id, number: check.number, dueDate: check.dueDate, cashedOn: check.cashedOn },
      lender: loan?.lenderName ?? null,
      locked: await this.locked(p),
      account: p.account,
      canRemove: allowed && (!closedThrough || p.paidOn > closedThrough),
    };
  }

  private async payOptions(ctx: StaffContext, bill: Bill, closedThrough: string | null): Promise<PayOptionsDTO | null> {
    const leftKurus = bill.totalKurus - bill.paidKurus;
    if (bill.voidedAt || leftKurus <= 0 || !ctx.permissions.has("bills.manage")) return null;
    const cafeId = ctx.cafe.id;
    const canCard = ctx.permissions.has("debts.card");
    const canDebt = ctx.permissions.has("debts.edit");
    const card = canCard ? await this.debts.getCard(cafeId) : null;
    const team = canDebt ? await this.team(cafeId) : [];
    // One name per lender, as it was first typed.
    const byKey = new Map<string, string>();
    for (const l of canDebt ? await this.debts.listLoans(cafeId) : []) if (!l.lenderMemberId && !byKey.has(l.lenderKey)) byKey.set(l.lenderKey, l.lenderName);
    const lenderNames = [...byKey.values()];
    const cashFrom = await this.money.cashFrom(cafeId, ctx.permissions);
    return { leftKurus, credit: card?.name ?? null, creditNotSet: canCard && !card, check: canDebt, loan: canDebt, team, lenderNames, cashFrom, closedThrough };
  }

  /** Who is on the team now, by name. */
  async team(cafeId: string): Promise<{ memberId: string; name: string }[]> {
    const out: { memberId: string; name: string }[] = [];
    for (const m of await this.staff.listMembers(cafeId)) {
      if (m.removedAt) continue;
      const account = await this.staff.getAccount(m.accountId);
      if (account) out.push({ memberId: m.id, name: account.name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "tr"));
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
    const doc = bill.documentId ? await this.scans.documents.getDocumentInfo(cafeId, bill.documentId) : null;
    const closedThrough = await this.money.closedThrough(cafeId);
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
      payments: await Promise.all(bill.payments.map((p) => this.paymentDto(ctx, p, names, closedThrough))),
      voidedAt: bill.voidedAt?.toISOString() ?? null,
      voidedBy: bill.voidedById ? (names.get(bill.voidedById) ?? null) : null,
      voidReason: bill.voidReason,
      canManage: ctx.permissions.has("bills.manage"),
      payWith: await this.payOptions(ctx, bill, closedThrough),
      closed: !!closedThrough && bill.date <= closedThrough,
      kdv: bill.kdv,
      document: doc
        ? {
            id: doc.id,
            name: doc.name,
            contentType: doc.contentType,
            size: doc.size,
            url: `/api/v1/staff/${encodeURIComponent(ctx.cafe.slug)}/documents/${doc.id}`,
            sender: doc.sender,
          }
        : null,
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

/** The same key at the same café gives the same id, so a retried tap finds what the first one made. */
export function keyHash(cafeId: string, key: string): string {
  return createHash("sha256").update(`${cafeId}:${key}`).digest("hex").slice(0, 24);
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
