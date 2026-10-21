import {
  defaultSettings,
  lenderKey,
  localDateKey,
  orderTotals,
  plusDays,
  startOfLocalDay,
  weekStartOf,
  type Bill,
  type BillCategory,
  type BillLine,
  type BillPayMethod,
  type BillPayment,
  type Cafe,
  type CafePeniSettings,
  type CardPayment,
  type CardSettings,
  type CashCount,
  type CashSession,
  type Check,
  type Loan,
  type LoanRepayment,
  type MenuCategory,
  type MenuItem,
  type MoneyMethod,
  type MoneyMovement,
  type MoneyStart,
  type Order,
  type OrderLine,
  type PayPayout,
  type PayRate,
  type Payment,
  type Recipe,
  type Shift,
  type ShiftWeek,
  type StaffAccount,
  type StaffMember,
  type StaffRole,
  type StockBatch,
  type StockItem,
  type StockUnit,
  type Supplier,
  type TaskAssign,
  type TaskCheck,
  type TaskItem,
  type TaskList,
  type Weekday,
  type WorkDay,
} from "@peni/core";
import type { ShelbySnapshot } from "./source";

/**
 * Shelby's records as Peni's (plan piece 33). Ids start with `shelby_` and Shelby's own id,
 * so anything in Peni can be traced back. Money goes from lira to kuruş, Shelby's units to
 * kg, l or adet, and Shelby's admin becomes the owner. What Peni keeps differently, or not
 * at all, is in the report: nothing is dropped without saying so.
 */

export interface MoveOptions {
  /** The Peni café to move into. */
  cafeId: string;
  slug: string;
  /** The moment of the move: the money's start and the stock count are taken then. */
  now: Date;
  /**
   * Records dated before this aren't moved. By default the start of Shelby's open
   * accounting period: the previous owner's records, hidden in Shelby, stay there.
   * Null moves everything.
   */
  from?: Date | null;
}

export interface PeniRecords {
  cafe: Cafe;
  settings: CafePeniSettings;
  accounts: StaffAccount[];
  members: StaffMember[];
  categories: MenuCategory[];
  products: MenuItem[];
  stockItems: StockItem[];
  /** Today's stock, as a count. */
  stockStart: StockBatch | null;
  recipes: Recipe[];
  orders: Order[];
  payments: Payment[];
  cashSessions: CashSession[];
  suppliers: Supplier[];
  bills: Bill[];
  billPayments: BillPayment[];
  checks: Check[];
  loans: Loan[];
  repayments: LoanRepayment[];
  card: CardSettings | null;
  cardPayments: CardPayment[];
  moneyStart: MoneyStart | null;
  movements: MoneyMovement[];
  shifts: Shift[];
  weeks: ShiftWeek[];
  workDays: WorkDay[];
  rates: PayRate[];
  payouts: PayPayout[];
  taskLists: TaskList[];
  taskItems: TaskItem[];
  taskChecks: TaskCheck[];
}

export interface MoveReport {
  shelbyCafe: string;
  /** "YYYY-MM-DD", or null when everything was moved. */
  from: string | null;
  moved: { what: string; count: number }[];
  notMoved: { what: string; count: number; why: string }[];
  warnings: string[];
}

export interface Mapped {
  records: PeniRecords;
  report: MoveReport;
}

/** Lira (unrounded in Shelby) to kuruş. */
export const kurus = (lira: number): number => Math.round((lira + Math.sign(lira) * 1e-9) * 100);

/** Shelby's free-text units as Peni's, and what one of them is in Peni's. */
export function unitOf(unit: string): { unit: StockUnit; factor: number } {
  const u = unit.trim().toLowerCase();
  if (u === "kg") return { unit: "kg", factor: 1 };
  if (u === "g" || u === "gr") return { unit: "kg", factor: 0.001 };
  if (u === "l" || u === "lt") return { unit: "l", factor: 1 };
  if (u === "ml") return { unit: "l", factor: 0.001 };
  return { unit: "adet", factor: 1 };
}

/** An amount in Shelby's unit, in thousandths of Peni's. */
export const milliOf = (qty: number, unit: string): number => Math.round(qty * unitOf(unit).factor * 1000);

/** Shelby's week starts are a Sunday at 00:00Z meaning the Monday after (newer) or the Monday itself (older). */
export function mondayOf(weekStart: Date): string {
  const day = weekStart.toISOString().slice(0, 10);
  if (weekStart.getUTCDay() === 0) return plusDays(day, 1);
  return weekStartOf(day);
}

const ROLE: Record<string, StaffRole> = { admin: "owner", owner: "owner", manager: "manager", chef: "chef", barista: "barista" };
const BILL_CATEGORY: Record<string, BillCategory> = {
  rent: "rent",
  utilities: "utilities",
  ingredients: "ingredients",
  supplies: "supplies",
  wages: "wages",
  other: "other",
};

/** The Shelby café's open accounting period starts here; before it is the previous owner's. */
export function defaultFrom(snap: ShelbySnapshot): Date | null {
  const open = snap.accountingPeriods.filter((p) => p.status === "open").sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  return open?.startsAt ?? null;
}

export function mapShelby(snap: ShelbySnapshot, opts: MoveOptions): Mapped {
  const { cafeId, now } = opts;
  const from = opts.from === undefined ? defaultFrom(snap) : opts.from;
  const tz = snap.cafe.timezone || "Europe/Istanbul";
  const day = (d: Date) => localDateKey(d, tz);
  const today = day(now);
  const kept = (d: Date | null | undefined) => !from || !d || d >= from;
  const fromDay = from ? day(from) : null;
  const warnings: string[] = [];
  const notMoved: MoveReport["notMoved"] = [];
  const skip = (what: string, count: number, why: string) => {
    if (count > 0) notMoved.push({ what, count, why });
  };

  // ── Café
  const cafe: Cafe = {
    id: cafeId,
    slug: opts.slug,
    name: snap.cafe.name,
    address: null,
    district: null,
    city: null,
    coverImageUrl: null,
    referenceProductIds: [],
    hue: null,
    // A café moving from Shelby already runs on it: it keeps everything (N11).
    plan: "isletme",
    trialEndsAt: null,
  };
  const settings: CafePeniSettings = { ...defaultSettings(cafeId), timeZone: tz };

  // ── Team: the same email and password; Shelby's admin is the owner.
  const accounts: StaffAccount[] = [];
  const members: StaffMember[] = [];
  const memberOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  for (const u of snap.users) {
    let role = ROLE[u.role];
    if (!role) {
      warnings.push(`${u.name} had the role "${u.role}" in Shelby; moved as a barista.`);
      role = "barista";
    }
    accounts.push({
      id: `shelby_u${u.id}`,
      email: u.email.trim().toLowerCase(),
      name: u.name,
      passwordHash: u.password || null,
      customerId: null,
      disabledAt: null,
    });
    members.push({
      id: `shelby_m${u.id}`,
      cafeId,
      accountId: `shelby_u${u.id}`,
      role,
      createdAt: u.createdAt,
      removedAt: null,
      pinHash: null,
      pinFailures: 0,
      pinLockedUntil: null,
    });
    memberOf.set(u.id, `shelby_m${u.id}`);
    nameOf.set(u.id, u.name);
  }
  const first = members.find((m) => m.role === "owner");
  if (!first) throw new Error("Shelby has no admin for this café: Penny needs an owner to move into");
  const owner = first.id;
  const who = (userId: string | null | undefined) => (userId && memberOf.get(userId)) || owner;
  skip(
    "Role permission changes",
    snap.rolePermissions.length,
    "Penny's pages differ from Shelby's; each role starts with Penny's defaults, to review in Ayarlar → Ekip.",
  );

  // ── Menu
  const categories: MenuCategory[] = snap.categories.map((c, i) => ({ id: `shelby_c${c.id}`, cafeId, name: c.name, sortOrder: i }));
  const categoryName = new Map(snap.categories.map((c) => [c.id, c.name]));
  const productName = new Map(snap.products.map((p) => [p.id, p.name]));
  const products: MenuItem[] = snap.products.map((p, i) => ({
    productId: `shelby_p${p.id}`,
    name: p.name,
    categoryId: `shelby_c${p.categoryId}`,
    category: categoryName.get(p.categoryId) ?? "",
    priceKurus: kurus(p.price),
    available: p.active,
    description: null,
    imageUrl: p.image && /^https?:\/\//.test(p.image) ? p.image : null,
    sortOrder: i,
    archivedAt: null,
  }));

  // ── Stock: today's amounts as a count; Shelby's log of changes stays there.
  const stockUnit = new Map(snap.stockItems.map((s) => [s.id, s.unit]));
  const stockItems: StockItem[] = snap.stockItems.map((s) => {
    const { unit, factor } = unitOf(s.unit);
    return {
      id: `shelby_s${s.id}`,
      cafeId,
      name: s.name,
      kind: s.kind === "supply" ? "supply" : "ingredient",
      unit,
      qtyMilli: 0,
      minMilli: Math.max(0, milliOf(s.minStock, s.unit)),
      costKurus: s.costPerUnit > 0 ? kurus(s.costPerUnit / factor) : null,
      archivedAt: null,
      createdAt: s.createdAt,
    };
  });
  const units = [...new Set(snap.stockItems.map((s) => s.unit).filter((u) => !["kg", "g", "l", "ml", "pcs", "adet"].includes(u.trim().toLowerCase())))];
  if (units.length) warnings.push(`Stock counted in ${units.map((u) => `"${u}"`).join(", ")} in Shelby is counted in adet in Penny.`);
  const below = snap.stockItems.filter((s) => s.currentStock < 0);
  if (below.length) warnings.push(`${below.length} stock item(s) were below zero in Shelby (${below.map((s) => s.name).join(", ")}); they start at zero.`);
  const stockStart: StockBatch | null = snap.stockItems.length
    ? {
        cafeId,
        batchKey: "shelby:start",
        reason: "start",
        note: "Shelby'den taşındı",
        memberId: owner,
        at: now,
        changes: snap.stockItems.map((s) => ({
          id: `shelby_start_${s.id}`,
          itemId: `shelby_s${s.id}`,
          countedMilli: Math.max(0, milliOf(s.currentStock, s.unit)),
        })),
      }
    : null;
  skip("Stock history (each change)", snap.stockLogs.length, "Penny starts each item from today's amount; the history stays readable in Shelby.");
  if (snap.stockCategories.length) skip("Stock categories", snap.stockCategories.length, "Penny groups stock as ingredients and supplies only.");

  const recipes: Recipe[] = [];
  let legacyStock = 0;
  for (const p of snap.products) {
    const productId = `shelby_p${p.id}`;
    if (p.trackingMode === "recipe") {
      const lines = snap.ingredients
        .filter((i) => i.productId === p.id)
        .map((i) => ({ itemId: `shelby_s${i.stockItemId}`, qtyMilli: milliOf(i.quantity, stockUnit.get(i.stockItemId) ?? "pcs") }))
        .filter((l) => l.qtyMilli > 0);
      recipes.push({ cafeId, productId, mode: lines.length ? "recipe" : "none", lines });
    } else if (p.trackingMode === "direct" && p.linkedStockItemId) {
      // One of the item for each sale: a recipe of one line.
      recipes.push({
        cafeId,
        productId,
        mode: "recipe",
        lines: [{ itemId: `shelby_s${p.linkedStockItemId}`, qtyMilli: milliOf(1, stockUnit.get(p.linkedStockItemId) ?? "pcs") }],
      });
    } else {
      if (p.trackingMode === null) legacyStock++;
      recipes.push({ cafeId, productId, mode: "none", lines: [] });
    }
  }
  if (legacyStock) warnings.push(`${legacyStock} product(s) used Shelby's old per-product stock; they move without stock tracking.`);

  // ── Kasa sessions, so sales find their drawer day.
  const sessions = snap.cashSessions.filter((s) => kept(s.openedAt));
  const count = (expected: number | null, countLira: number, difference: number, note: string | null, at: Date, by: string): CashCount => ({
    expectedKurus: expected === null ? null : kurus(expected),
    countKurus: kurus(countLira),
    differenceKurus: kurus(difference),
    counts: null,
    note,
    at,
    byMemberId: who(by),
  });
  const cashSessions: CashSession[] = sessions.map((s) => ({
    id: `shelby_cs_${s.id}`,
    cafeId,
    opening: count(s.openingExpected, s.openingCount, s.openingDifference, s.openingNote, s.openedAt, s.openedById),
    closing:
      s.closedAt && s.closingCount !== null
        ? count(
            s.closingExpected,
            s.closingCount,
            s.closingDifference ?? s.closingCount - (s.closingExpected ?? 0),
            s.closingNote,
            s.closedAt,
            s.closedById ?? s.openedById,
          )
        : null,
    openKey: `shelby:${s.openRequestKey}`,
    closeKey: s.closeRequestKey ? `shelby:${s.closeRequestKey}` : null,
  }));
  if (cashSessions.some((s) => !s.closing)) warnings.push("Shelby's drawer was still open: close it in Shelby (Kasa kapat) before the final move.");
  const sessionAt = (at: Date) => {
    const s = sessions.find((x) => x.openedAt <= at && (!x.closedAt || at <= x.closedAt));
    return s ? `shelby_cs_${s.id}` : null;
  };

  // ── Orders and their payments. Shelby's total is what the customer paid.
  const itemsOf = new Map<number, ShelbySnapshot["orderItems"]>();
  for (const i of snap.orderItems) itemsOf.set(i.orderId, [...(itemsOf.get(i.orderId) ?? []), i]);
  const pending = snap.orders.filter((o) => o.status === "pending" || o.status === "cancelled");
  skip("Orders never paid (pending)", pending.filter((o) => kept(o.createdAt)).length, "Left open at Shelby's till and never paid; they made no sale.");
  const unknown = snap.orders.filter((o) => !["pending", "cancelled", "paid", "voided", "refunded"].includes(o.status));
  if (unknown.length) warnings.push(`${unknown.length} order(s) had an unknown status and weren't moved.`);
  const movedOrders = snap.orders
    .filter((o) => ["paid", "voided", "refunded"].includes(o.status) && kept(o.createdAt))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  const numberOn = new Map<string, number>();
  const orders: Order[] = [];
  const payments: Payment[] = [];
  let missingItems = 0;
  for (const o of movedOrders) {
    const businessDay = day(o.createdAt);
    const number = (numberOn.get(businessDay) ?? 0) + 1;
    numberOn.set(businessDay, number);
    const lines: OrderLine[] = (itemsOf.get(o.id) ?? []).map((i) => ({
      productId: `shelby_p${i.productId}`,
      name: productName.get(i.productId) ?? `Ürün ${i.productId}`,
      unitPriceKurus: kurus(i.unitPrice),
      quantity: i.quantity,
      discountPercent: i.discountPercent,
    }));
    const totalKurus = kurus(o.total);
    const computed = orderTotals(lines, o.discountPercent);
    if (Math.abs(computed.totalKurus - totalKurus) > 1) missingItems++;
    const subtotalKurus = Math.max(computed.subtotalKurus, totalKurus);
    const method = o.paymentMethod === "card" ? "card" : "cash";
    const paidAt = o.status === "voided" ? null : (o.paidAt ?? o.createdAt);
    const refundKurus = o.status === "refunded" ? kurus(o.refundAmount ?? o.total) : null;
    const id = `shelby_o${o.id}`;
    orders.push({
      id,
      cafeId,
      number,
      businessDay,
      status: o.status as Order["status"],
      lines,
      discountPercent: o.discountPercent,
      subtotalKurus,
      discountKurus: subtotalKurus - totalKurus,
      totalKurus,
      createdAt: o.createdAt,
      createdByMemberId: owner,
      createKey: `shelby:${o.orderNumber}`,
      paidAt,
      paidByMemberId: paidAt ? owner : null,
      paymentMethod: paidAt ? method : null,
      tenderedKurus: null,
      changeKurus: null,
      voidedAt: o.status === "voided" ? (o.voidedAt ?? o.updatedAt) : null,
      voidedByMemberId: o.status === "voided" ? who(o.voidedByUserId) : null,
      voidReason: o.status === "voided" ? (o.voidReason ?? "Shelby") : null,
      refundedAt: o.status === "refunded" ? (o.refundedAt ?? o.updatedAt) : null,
      refundedByMemberId: o.status === "refunded" ? who(o.refundedByUserId) : null,
      refundReason: o.status === "refunded" ? (o.refundReason ?? "Shelby") : null,
      refundKurus,
      deletedAt: null,
      deletedByMemberId: null,
      deleteReason: null,
    });
    const payment = (kind: Payment["kind"], amountKurus: number, at: Date, by: string): Payment => ({
      id: `shelby_pay_${o.id}_${kind}`,
      cafeId,
      orderId: id,
      kind,
      method,
      amountKurus,
      tenderedKurus: null,
      changeKurus: null,
      status: "approved",
      terminal: "manual",
      deviceId: null,
      cashSessionId: method === "cash" ? sessionAt(at) : null,
      key: `shelby:${o.orderNumber}:${kind}`,
      reason: kind === "refund" ? (o.refundReason ?? "Shelby") : null,
      startedAt: at,
      startedByMemberId: by,
      settledAt: at,
      settledByMemberId: by,
      reference: o.orderNumber,
      receiptNo: null,
      failure: null,
    });
    if (paidAt) payments.push(payment("sale", totalKurus, paidAt, owner));
    if (refundKurus !== null) payments.push(payment("refund", refundKurus, o.refundedAt ?? o.updatedAt, who(o.refundedByUserId)));
  }
  if (missingItems) warnings.push(`${missingItems} order(s) lost some of their lines in Shelby (a product was deleted); Penny keeps Shelby's total for them.`);

  // ── Suppliers and bills. Wages come from Puantaj, not from Shelby's weekly wage bills.
  const suppliers: Supplier[] = snap.suppliers.map((s) => ({
    id: `shelby_sup${s.id}`,
    cafeId,
    name: s.name,
    phone: s.phone?.trim() || null,
    email: null,
    taxNo: null,
    iban: null,
    note: [s.category && s.category !== "other" ? s.category : null, s.notes?.trim() || null].filter(Boolean).join(" · ") || null,
    archivedAt: null,
    createdAt: s.createdAt,
  }));
  const wageBills = snap.expenses.filter((e) => e.sourceType === "timesheet_wages");
  skip(
    "Weekly wage bills",
    wageBills.filter((e) => kept(e.date)).length,
    "Shelby wrote one per week from the timesheets; Penny keeps the same pay as hours and payouts in Puantaj ve maaş.",
  );
  const expenses = snap.expenses.filter((e) => e.sourceType !== "timesheet_wages" && kept(e.date));
  const receiptOf = new Map(snap.receipts.map((r) => [r.id, r]));
  const receiptLines = new Map<number, ShelbySnapshot["receiptLines"]>();
  for (const l of snap.receiptLines) receiptLines.set(l.receiptId, [...(receiptLines.get(l.receiptId) ?? []), l]);
  const stockOnly = snap.receipts.filter((r) => r.financialMode === "stock_only" && kept(r.receivedAt));
  skip("Deliveries with no bill (stock only)", stockOnly.length, "They only added stock, which is in today's amounts.");

  const paymentsOf = new Map<number, ShelbySnapshot["expensePayments"]>();
  for (const p of snap.expensePayments) paymentsOf.set(p.expenseId, [...(paymentsOf.get(p.expenseId) ?? []), p]);
  const checkOf = new Map(snap.expenseChecks.filter((c) => c.expensePaymentId !== null).map((c) => [c.expensePaymentId!, c]));
  const supplierName = new Map(snap.suppliers.map((s) => [s.id, s.name]));

  const bills: Bill[] = [];
  const billPayments: BillPayment[] = [];
  const checks: Check[] = [];
  const loans: Loan[] = [];
  let legacyPaid = 0;
  let stale = 0;
  for (const e of expenses) {
    const id = `shelby_e${e.id}`;
    const totalKurus = kurus(e.amount);
    const category = BILL_CATEGORY[e.category] ?? "other";
    const receipt = e.sourcePurchaseReceiptId ? receiptOf.get(e.sourcePurchaseReceiptId) : undefined;
    let lines: BillLine[] = receipt
      ? (receiptLines.get(receipt.id) ?? []).map((l) => ({
          itemId: `shelby_s${l.stockItemId}`,
          name: l.itemNameSnapshot,
          category,
          qtyMilli: milliOf(l.quantity, l.unitSnapshot),
          totalKurus: kurus(l.lineTotal),
        }))
      : [];
    if (!lines.length) lines = [{ itemId: null, name: e.description || "Gider", category, qtyMilli: null, totalKurus }];
    const gap = totalKurus - lines.reduce((s, l) => s + l.totalKurus, 0);
    if (gap !== 0) lines.push({ itemId: null, name: "Fark (Shelby)", category, qtyMilli: null, totalKurus: gap });

    let paid = paymentsOf.get(e.id) ?? [];
    if (!paid.length && e.paidAmount > 0) {
      // Older Shelby bills were marked paid without a payment row: one payment on the bill's date.
      legacyPaid++;
      paid = [
        {
          id: -e.id,
          expenseId: e.id,
          amount: e.paidAmount,
          method: e.paymentMethod ?? "cash",
          cashAccount: null,
          borrowedFromUserId: e.borrowedFromUserId,
          borrowedFromName: e.borrowedFromName,
          notes: null,
          paidAt: e.date,
          createdAt: e.createdAt,
        },
      ];
    }
    const paidLira = paid.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(paidLira - e.paidAmount) > 0.005) stale++;

    const pays: BillPayment[] = [];
    for (const p of paid) {
      const pid = p.id < 0 ? `shelby_ep_legacy${e.id}` : `shelby_ep${p.id}`;
      const method = payMethod(p.method);
      const paidOn = day(p.paidAt);
      pays.push({ id: pid, cafeId, billId: id, amountKurus: kurus(p.amount), method, paidOn, account: null, memberId: owner, createdAt: p.createdAt });
      if (method === "check") {
        const c = p.id > 0 ? checkOf.get(p.id) : undefined;
        checks.push(
          checkFrom(c, {
            id: c ? `shelby_ck${c.id}` : `shelby_ck_ep${pid}`,
            amountLira: p.amount,
            paidOn,
            supplierId: e.supplierId,
            billPaymentId: pid,
            createdAt: p.createdAt,
          }),
        );
      }
      if (method === "loan") {
        const userId = p.borrowedFromUserId ?? e.borrowedFromUserId;
        const lenderMemberId = userId ? (memberOf.get(userId) ?? null) : null;
        const lenderName = (userId && nameOf.get(userId)) || p.borrowedFromName || e.borrowedFromName || "Bilinmiyor";
        loans.push({
          id: `shelby_loan_${pid}`,
          cafeId,
          lenderKey: lenderKey({ memberId: lenderMemberId, name: lenderName }),
          lenderMemberId,
          lenderName,
          amountKurus: kurus(p.amount),
          borrowedOn: paidOn,
          dueDate: null,
          note: e.description || null,
          billPaymentId: pid,
          createdById: owner,
          createdAt: p.createdAt,
        });
      }
    }
    billPayments.push(...pays);
    const paidKurus = pays.reduce((s, p) => s + p.amountKurus, 0);
    const lastPaid = paid.map((p) => p.paidAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    bills.push({
      id,
      cafeId,
      supplierId: e.supplierId ? `shelby_sup${e.supplierId}` : null,
      number: receipt?.invoiceNumber ?? null,
      date: day(e.date),
      dueDate: e.dueDate ? day(e.dueDate) : null,
      note: [receipt ? e.description : null, receipt?.notes].filter(Boolean).join(" · ") || null,
      lines,
      totalKurus,
      kdv: [],
      documentId: null,
      paidKurus,
      paidAt: paidKurus >= totalKurus ? lastPaid : null,
      payments: pays,
      version: 1,
      voidedAt: null,
      voidedById: null,
      voidReason: null,
      createdById: owner,
      createdAt: e.createdAt,
      updatedAt: e.createdAt,
      createKey: `shelby:expense:${e.id}`,
    });
  }
  if (legacyPaid) warnings.push(`${legacyPaid} older bill(s) were marked paid in Shelby with no payment; each gets one payment on its own date.`);
  if (stale) warnings.push(`${stale} bill(s) had a paid amount in Shelby that didn't match their payments; Penny goes by the payments.`);

  // Checks written before Shelby linked them to a payment.
  const movedExpense = new Set(expenses.map((e) => e.id));
  for (const c of snap.expenseChecks) {
    if (c.expensePaymentId !== null || !movedExpense.has(c.expenseId)) continue;
    const e = snap.expenses.find((x) => x.id === c.expenseId);
    checks.push(
      checkFrom(c, {
        id: `shelby_ck${c.id}`,
        amountLira: c.amount,
        paidOn: day(c.createdAt),
        supplierId: e?.supplierId ?? null,
        billPaymentId: null,
        createdAt: c.createdAt,
      }),
    );
  }

  function checkFrom(
    c: ShelbySnapshot["expenseChecks"][number] | undefined,
    base: { id: string; amountLira: number; paidOn: string; supplierId: number | null; billPaymentId: string | null; createdAt: Date },
  ): Check {
    if (!c)
      warnings.push(
        `A check payment of ₺${base.amountLira} on ${base.paidOn} had no check details in Shelby; moved with no number, due on the day it was given.`,
      );
    return {
      id: base.id,
      cafeId,
      number: c?.checkNumber ?? "?",
      bankName: null,
      payee: base.supplierId ? (supplierName.get(base.supplierId) ?? null) : null,
      supplierId: base.supplierId ? `shelby_sup${base.supplierId}` : null,
      amountKurus: kurus(c?.amount ?? base.amountLira),
      writtenOn: base.paidOn,
      dueDate: c ? c.dueDate.toISOString().slice(0, 10) : base.paidOn,
      note: [c?.drawerName ? `Keşideci: ${c.drawerName}` : null, c?.notes?.trim() || null].filter(Boolean).join(" · ") || null,
      billPaymentId: base.billPaymentId,
      cashedOn: c?.isPaid ? day(c.paidAt ?? c.dueDate) : null,
      cashedById: c?.isPaid ? owner : null,
      createdById: owner,
      createdAt: base.createdAt,
    };
  }

  // ── Loans paid back, and the café's credit card.
  const repayments: LoanRepayment[] = snap.debtRepayments
    .filter((r) => kept(r.paidAt))
    .map((r) => {
      const lenderMemberId = r.lenderUserId ? (memberOf.get(r.lenderUserId) ?? null) : null;
      const name = (r.lenderUserId && nameOf.get(r.lenderUserId)) || r.lenderName || "Bilinmiyor";
      return {
        id: `shelby_dr${r.id}`,
        cafeId,
        lenderKey: lenderKey({ memberId: lenderMemberId, name }),
        amountKurus: kurus(r.amount),
        method: moneyMethod(r.method),
        paidOn: day(r.paidAt),
        account: null,
        memberId: owner,
        createdAt: r.createdAt,
      };
    });
  const card: CardSettings | null = snap.card
    ? {
        cafeId,
        name: snap.card.name,
        limitKurus: kurus(snap.card.creditLimit),
        statementDay: snap.card.statementDay,
        dueDay: snap.card.paymentDay,
        updatedAt: snap.card.updatedAt,
      }
    : null;
  const cardPayments: CardPayment[] = snap.cardPayments
    .filter((p) => kept(p.paidAt))
    .map((p) => ({
      id: `shelby_ccp${p.id}`,
      cafeId,
      amountKurus: kurus(p.amount),
      method: p.method === "cash" ? "cash" : "bank",
      paidOn: day(p.paidAt),
      account: null,
      memberId: owner,
      createdAt: p.createdAt,
    }));

  // ── Money: Peni starts today with what Shelby holds now. Card sales already moved for
  // today count in the bank from the start, so the opening is what's left of the bank.
  let moneyStart: MoneyStart | null = null;
  const movements: MoneyMovement[] = [];
  if (snap.cafe.moneyInitializedAt) {
    const balance = (kind: string) => kurus(snap.moneyAccounts.find((a) => a.kind === kind)?.balance ?? 0);
    const dayStart = startOfLocalDay(now, tz);
    const cardToday = payments
      .filter((p) => p.method === "card" && p.settledAt && p.settledAt >= dayStart && p.settledAt <= now)
      .reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0);
    moneyStart = { cafeId, startedOn: today, memberId: owner, createdAt: now };
    const opening = (account: "reserve" | "bank", amountKurus: number): MoneyMovement => ({
      id: `shelby_open_${account}`,
      cafeId,
      account,
      amountKurus,
      kind: "opening",
      counterpart: null,
      source: "opening",
      day: today,
      note: "Shelby'den taşındı",
      memberId: owner,
      createdAt: now,
    });
    movements.push(opening("reserve", balance("safe")), opening("bank", balance("bank") - cardToday));
    skip(
      "Money movements (each one)",
      snap.moneyMovements.length,
      "Penny starts from today's balances in the drawer, the reserve and the bank; the history stays readable in Shelby.",
    );
  } else warnings.push("Shelby never started keeping the café's money (Nakit ve banka), so Penny doesn't start it either: press Başla there.");

  // ── Shifts. Weeks drawn with blocks; the oldest ones with shift templates.
  const scheduleWeek = new Map(snap.schedules.map((s) => [s.id, mondayOf(s.weekStart)]));
  const keptWeek = (scheduleId: number) => {
    const w = scheduleWeek.get(scheduleId);
    return !!w && (!fromDay || plusDays(w, 6) >= fromDay);
  };
  const weeks: ShiftWeek[] = snap.schedules
    .filter((s) => keptWeek(s.id))
    .map((s) => ({
      cafeId,
      weekStart: scheduleWeek.get(s.id)!,
      publishedAt: s.status === "approved" ? (s.approvedAt ?? s.createdAt) : null,
      publishedById: s.status === "approved" ? who(s.approvedById) : null,
    }));
  const blockPeople = new Map<number, string[]>();
  for (const a of snap.shiftBlockAssignments) blockPeople.set(a.shiftBlockId, [...(blockPeople.get(a.shiftBlockId) ?? []), who(a.userId)]);
  const shifts: Shift[] = snap.shiftBlocks
    .filter((b) => keptWeek(b.scheduleId))
    .map((b) => ({
      id: `shelby_sb${b.id}`,
      cafeId,
      day: plusDays(scheduleWeek.get(b.scheduleId)!, b.dayOfWeek),
      startMinutes: b.startMinutes,
      endMinutes: b.endMinutes,
      memberIds: [...new Set(blockPeople.get(b.id) ?? [])],
      note: b.notes?.trim() || null,
      createdById: owner,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  const withBlocks = new Set(snap.shiftBlocks.map((b) => b.scheduleId));
  const template = new Map(snap.shiftTemplates.map((t) => [t.id, t]));
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const legacy = new Map<string, Shift>();
  for (const a of snap.shiftAssignments) {
    if (withBlocks.has(a.scheduleId) || !keptWeek(a.scheduleId)) continue;
    const t = template.get(a.shiftTemplateId);
    if (!t) continue;
    const key = `shelby_sa${a.scheduleId}_${a.dayOfWeek}_${t.id}`;
    const at = snap.schedules.find((s) => s.id === a.scheduleId)!.createdAt;
    const s = legacy.get(key) ?? {
      id: key,
      cafeId,
      day: plusDays(scheduleWeek.get(a.scheduleId)!, a.dayOfWeek),
      startMinutes: minutes(t.startTime),
      endMinutes: minutes(t.endTime) || 24 * 60,
      memberIds: [],
      note: t.name,
      createdById: owner,
      createdAt: at,
      updatedAt: at,
    };
    if (!s.memberIds.includes(who(a.userId))) s.memberIds.push(who(a.userId));
    legacy.set(key, s);
  }
  shifts.push(...legacy.values());

  // ── Hours and pay. Shelby keeps a week's hours; Peni keeps days, so each week's hours go
  // on the days the person was on the plan, in proportion, or on the Monday.
  const timesheets = snap.timesheets.filter((t) => keptWeek(t.scheduleId));
  const workDays: WorkDay[] = [];
  const lastDayOf = new Map<number, string>();
  for (const t of timesheets) {
    const memberId = who(t.userId);
    const week = scheduleWeek.get(t.scheduleId)!;
    const planned = new Map<string, number>();
    for (const s of shifts)
      if (s.memberIds.includes(memberId) && s.day >= week && s.day <= plusDays(week, 6))
        planned.set(s.day, (planned.get(s.day) ?? 0) + Math.max(0, s.endMinutes - s.startMinutes));
    const total = Math.round(t.hoursWorked * 60);
    if (total <= 0) continue;
    const days = [...planned].filter(([, m]) => m > 0).sort(([a], [b]) => a.localeCompare(b));
    const plan = days.reduce((s, [, m]) => s + m, 0);
    const spread: [string, number][] = plan ? days.map(([d, m]) => [d, Math.floor((total * m) / plan)]) : [[week, total]];
    spread[spread.length - 1]![1] += total - spread.reduce((s, [, m]) => s + m, 0);
    for (const [d, m] of spread) {
      if (m <= 0) continue;
      const had = workDays.find((w) => w.memberId === memberId && w.day === d);
      if (had) had.minutes += m;
      else workDays.push({ cafeId, memberId, day: d, minutes: m, note: null, byId: owner, updatedAt: now });
    }
    lastDayOf.set(t.id, spread.at(-1)![0]);
  }

  // A pay rate from each week the rate changed.
  const rates: PayRate[] = [];
  const byUser = new Map<string, { week: string; kurus: number }[]>();
  for (const t of timesheets) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), { week: scheduleWeek.get(t.scheduleId)!, kurus: kurus(t.hourlyRate) }]);
  for (const u of snap.users) {
    const memberId = who(u.id);
    const weeksOf = (byUser.get(u.id) ?? []).sort((a, b) => a.week.localeCompare(b.week));
    let last: number | null = null;
    for (const w of weeksOf) {
      if (w.kurus === last) continue;
      rates.push({ id: `shelby_rate_${u.id}_${w.week}`, cafeId, memberId, fromDay: w.week, kurusPerHour: w.kurus, byId: owner, createdAt: now });
      last = w.kurus;
    }
    // Today's rate, for the weeks to come.
    if (u.hourlyRate !== null && kurus(u.hourlyRate) !== last) {
      const fromHere = weeksOf.length ? plusDays(weeksOf.at(-1)!.week, 7) : (fromDay ?? day(u.createdAt));
      rates.push({
        id: `shelby_rate_${u.id}_now`,
        cafeId,
        memberId,
        fromDay: fromHere > today ? today : fromHere,
        kurusPerHour: kurus(u.hourlyRate),
        byId: owner,
        createdAt: now,
      });
    }
  }

  const timesheetOf = new Map(timesheets.map((t) => [t.id, t]));
  const epOf = new Map(snap.expensePayments.map((p) => [p.id, p]));
  const payouts: PayPayout[] = snap.payrollPayouts
    .filter((p) => timesheetOf.has(p.timesheetEntryId))
    .map((p) => {
      const t = timesheetOf.get(p.timesheetEntryId)!;
      const worked = lastDayOf.get(t.id) ?? scheduleWeek.get(t.scheduleId)!;
      const ep = p.expensePaymentId ? epOf.get(p.expensePaymentId) : undefined;
      return {
        id: `shelby_po${p.id}`,
        cafeId,
        memberId: who(t.userId),
        month: worked.slice(0, 7),
        amountKurus: kurus(p.amount),
        method: (ep?.method ?? p.method) === "cash" ? "cash" : "bank",
        account: null,
        paidOn: day(p.paidAt),
        note: p.notes?.trim() || null,
        byId: who(p.createdByUserId),
        createdAt: p.createdAt,
      };
    });
  skip(
    "Closed pay months",
    snap.payrollPeriods.filter((p) => p.status === "closed" && kept(p.monthStart)).length,
    "Close them again in Puantaj ve maaş once the numbers are checked.",
  );

  // ── Görevler. Shelby picks the role per task; Peni per list, so a list with tasks for
  // several roles becomes one list per role.
  const taskLists: TaskList[] = [];
  const taskItems: TaskItem[] = [];
  const listFor = new Map<string, string>();
  for (const l of snap.taskLists) {
    const items = snap.taskItems.filter((i) => i.taskListId === l.id);
    const roles = l.assignmentMode === "first_shift" ? ["first"] : [...new Set(items.map((i) => i.targetRole))];
    if (!roles.length) roles.push("all");
    for (const r of roles) {
      const assign: TaskAssign = r === "first" ? "first" : r === "all" ? "all" : (ROLE[r] ?? "all");
      const id = roles.length > 1 ? `shelby_tl${l.id}_${r}` : `shelby_tl${l.id}`;
      listFor.set(`${l.id}:${r}`, id);
      taskLists.push({
        id,
        cafeId,
        name: roles.length > 1 ? `${l.name} · ${ROLE_NAME[assign as StaffRole] ?? r}` : l.name,
        assign,
        sortOrder: taskLists.length,
        archivedAt: l.archivedAt ?? (l.active ? null : now),
        createdById: owner,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      });
    }
    for (const i of items) {
      const listId = listFor.get(`${l.id}:${l.assignmentMode === "first_shift" ? "first" : i.targetRole}`)!;
      taskItems.push({
        id: `shelby_ti${i.id}`,
        cafeId,
        listId,
        title: i.title,
        note: i.description?.trim() || null,
        days: [((i.dayOfWeek % 7) + 1) as Weekday],
        sortOrder: i.sortOrder,
        fromDay: day(i.createdAt),
        untilDay: i.archivedAt ? day(i.archivedAt) : i.active ? null : today,
      });
    }
  }
  const itemIds = new Set(taskItems.map((i) => i.id));
  const occurrences = snap.taskOccurrences.filter((o) => !fromDay || o.dateKey >= fromDay);
  const taskChecks: TaskCheck[] = occurrences
    .filter((o) => (o.status === "completed" || o.status === "skipped") && itemIds.has(`shelby_ti${o.taskListItemId}`))
    .map((o) => ({
      cafeId,
      itemId: `shelby_ti${o.taskListItemId}`,
      day: o.dateKey,
      status: o.status === "completed" ? "done" : "skipped",
      note: o.note?.trim() || null,
      title: o.titleSnapshot,
      listName: o.listNameSnapshot,
      byId: who(o.completedByUserId),
      at: o.completedAt ?? o.updatedAt,
    }));
  skip(
    "Tasks left undone",
    occurrences.filter((o) => o.status === "pending" || o.status === "overdue").length,
    "Penny keeps the tasks that were done or skipped; the rest show as not done.",
  );

  // ── What stays in Shelby.
  if (from) {
    const before = (d: Date) => d < from;
    skip(
      "Records from before " + day(from),
      snap.orders.filter((o) => before(o.createdAt)).length + snap.expenses.filter((e) => before(e.date)).length,
      "The previous owner's orders and bills, hidden in Shelby too. Run with --all to move them.",
    );
  }
  const files = snap.attachments.filter((a) => a.status === "ready");
  skip("Bill photos and PDFs", files.length, "They're in Shelby's private file store; copying them needs its BLOB_READ_WRITE_TOKEN.");
  skip("AI conversations", snap.counts.aiConversations, "Penny's assistant starts fresh.");
  skip("Alerts", snap.counts.operationalAlerts, "Penny works out its own (Bugün).");
  skip("Old product stock log", snap.counts.inventoryLogs, "From before Shelby had stock items.");
  skip("Card terminal settings", snap.counts.posConfig, "Penny's till takes card payments by hand until the Ingenico link.");

  const records: PeniRecords = {
    cafe,
    settings,
    accounts,
    members,
    categories,
    products,
    stockItems,
    stockStart,
    recipes,
    orders,
    payments,
    cashSessions,
    suppliers,
    bills,
    billPayments,
    checks,
    loans,
    repayments,
    card,
    cardPayments,
    moneyStart,
    movements,
    shifts,
    weeks,
    workDays,
    rates,
    payouts,
    taskLists,
    taskItems,
    taskChecks,
  };
  const moved: MoveReport["moved"] = [
    ["Team", members.length],
    ["Menu categories", categories.length],
    ["Menu items", products.length],
    ["Stock items", stockItems.length],
    ["Recipes", recipes.filter((r) => r.mode === "recipe").length],
    ["Orders", orders.length],
    ["Till payments and refunds", payments.length],
    ["Kasa sessions", cashSessions.length],
    ["Suppliers", suppliers.length],
    ["Bills", bills.length],
    ["Bill payments", billPayments.length],
    ["Checks", checks.length],
    ["Loans", loans.length],
    ["Loan repayments", repayments.length],
    ["Credit card payments", cardPayments.length],
    ["Shifts", shifts.length],
    ["Days worked", workDays.length],
    ["Pay rates", rates.length],
    ["Payouts", payouts.length],
    ["Task lists", taskLists.length],
    ["Tasks", taskItems.length],
    ["Tasks done or skipped", taskChecks.length],
  ].map(([what, count]) => ({ what: what as string, count: count as number }));
  return { records, report: { shelbyCafe: snap.cafe.name, from: fromDay, moved, notMoved, warnings } };
}

const ROLE_NAME: Record<StaffRole, string> = { owner: "Sahip", manager: "Müdür", chef: "Mutfak", barista: "Barista" };

function payMethod(method: string): BillPayMethod {
  switch (method) {
    case "cash":
      return "cash";
    case "card":
      return "card";
    case "check":
      return "check";
    case "shelby_card":
      return "credit";
    case "borrowed_manager":
    case "borrowed_other":
      return "loan";
    default:
      return "bank";
  }
}

function moneyMethod(method: string): MoneyMethod {
  if (method === "cash") return "cash";
  if (method === "card") return "card";
  return "bank";
}
