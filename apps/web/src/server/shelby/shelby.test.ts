import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "../app";
import { checkMove } from "./check";
import { mapShelby, milliOf, mondayOf, unitOf, type Mapped } from "./map";
import { reportMarkdown } from "./report";
import type { ShelbySnapshot } from "./source";
import { writeShelby } from "./write";

const PASSWORD = "shelby-pass";
const at = (s: string) => new Date(s);
const C = "cafe_shelby_src";
const ADMIN = "u_admin";
const MANAGER = "u_manager";
const BARISTA = "u_barista";

/** A small Shelby café with one of everything the move has to deal with. */
function snapshot(hash: string): ShelbySnapshot {
  const order = (id: number, status: string, method: string | null, total: number, created: string, extra: Partial<ShelbySnapshot["orders"][number]> = {}) => ({
    id,
    orderNumber: `ORD-${created.slice(0, 10).replace(/-/g, "")}-${String(id).padStart(4, "0")}`,
    status,
    paymentMethod: method,
    total,
    discountPercent: 0,
    bankCommission: 0,
    vatAmount: 0,
    voidReason: null,
    voidedAt: null,
    voidedByUserId: null,
    refundReason: null,
    refundedAt: null,
    refundedByUserId: null,
    refundAmount: null,
    paidAt: status === "paid" || status === "refunded" ? at(created) : null,
    createdAt: at(created),
    updatedAt: at(created),
    ...extra,
  });
  const expense = (
    id: number,
    amount: number,
    paidAmount: number,
    category: string,
    date: string,
    extra: Partial<ShelbySnapshot["expenses"][number]> = {},
  ) => ({
    id,
    amount,
    paidAmount,
    status: paidAmount >= amount ? "fully_paid" : paidAmount > 0 ? "partially_paid" : "unpaid",
    description: `Gider ${id}`,
    category,
    date: at(date),
    dueDate: null,
    isPaid: paidAmount >= amount,
    paymentMethod: null,
    borrowedFromName: null,
    borrowedFromUserId: null,
    sourceType: "manual" as const,
    sourceScheduleId: null,
    sourcePurchaseReceiptId: null,
    supplierId: null,
    createdAt: at(date),
    ...extra,
  });
  const pay = (
    id: number,
    expenseId: number,
    amount: number,
    method: string,
    paidAt: string,
    extra: Partial<ShelbySnapshot["expensePayments"][number]> = {},
  ) => ({
    id,
    expenseId,
    amount,
    method,
    cashAccount: null,
    borrowedFromUserId: null,
    borrowedFromName: null,
    notes: null,
    paidAt: at(paidAt),
    createdAt: at(paidAt),
    ...extra,
  });
  return {
    readAt: at("2026-10-19T05:00:00Z"),
    cafe: {
      id: C,
      name: "Shelby Sokak",
      timezone: "Europe/Istanbul",
      moneyInitializedAt: at("2026-07-01T06:00:00Z"),
      vatRate: 0,
      bankCommissionRate: 0,
      createdAt: at("2026-01-01T00:00:00Z"),
    },
    users: [
      { id: ADMIN, email: "Mehmet@Shelby.test", password: hash, name: "Mehmet", role: "admin", hourlyRate: null, createdAt: at("2026-01-01T00:00:00Z") },
      { id: MANAGER, email: "ayse@shelby.test", password: hash, name: "Ayşe Kaya", role: "manager", hourlyRate: 150, createdAt: at("2026-07-01T00:00:00Z") },
      { id: BARISTA, email: "can@shelby.test", password: hash, name: "Can Demir", role: "barista", hourlyRate: 130, createdAt: at("2026-07-01T00:00:00Z") },
    ],
    categories: [
      { id: 1, name: "Kahveler", sortOrder: 0 },
      { id: 2, name: "Tatlılar", sortOrder: 1 },
    ],
    products: [
      {
        id: 10,
        name: "Latte",
        price: 120,
        vatRate: 0,
        image: null,
        active: true,
        trackingMode: "recipe",
        linkedStockItemId: null,
        categoryId: 1,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
      {
        id: 11,
        name: "Cheesecake",
        price: 150,
        vatRate: 0,
        image: "https://blob.example/cake.jpg",
        active: true,
        trackingMode: "direct",
        linkedStockItemId: 3,
        categoryId: 2,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
      {
        id: 12,
        name: "Eski kurabiye",
        price: 40,
        vatRate: 0,
        image: null,
        active: false,
        trackingMode: null,
        linkedStockItemId: null,
        categoryId: 2,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
    ],
    orders: [
      order(1, "paid", "cash", 240, "2026-10-17T08:00:00Z"),
      order(2, "paid", "card", 157.5, "2026-10-17T09:00:00Z", { discountPercent: 10 }),
      order(3, "refunded", "card", 150, "2026-10-18T10:00:00Z", {
        refundedAt: at("2026-10-18T10:30:00Z"),
        refundAmount: 150,
        refundReason: "Yanlış sipariş",
        refundedByUserId: MANAGER,
      }),
      order(4, "voided", null, 120, "2026-10-18T11:00:00Z", { voidedAt: at("2026-10-18T11:01:00Z"), voidReason: "Vazgeçti", voidedByUserId: BARISTA }),
      order(5, "pending", null, 120, "2026-10-18T12:00:00Z"),
      // Paid before Shelby kept paidAt; its cheesecake was deleted later.
      order(6, "paid", "cash", 270, "2026-09-01T09:00:00Z", { paidAt: null }),
      // The previous owner's.
      order(7, "paid", "cash", 999, "2026-05-01T09:00:00Z"),
    ],
    orderItems: [
      { id: 1, orderId: 1, productId: 10, quantity: 2, unitPrice: 120, discountPercent: 0, vatRate: 0 },
      { id: 2, orderId: 2, productId: 11, quantity: 1, unitPrice: 150, discountPercent: 0, vatRate: 0 },
      { id: 3, orderId: 2, productId: 10, quantity: 1, unitPrice: 25, discountPercent: 0, vatRate: 0 },
      { id: 4, orderId: 3, productId: 11, quantity: 1, unitPrice: 150, discountPercent: 0, vatRate: 0 },
      { id: 5, orderId: 4, productId: 10, quantity: 1, unitPrice: 120, discountPercent: 0, vatRate: 0 },
      { id: 6, orderId: 6, productId: 10, quantity: 1, unitPrice: 120, discountPercent: 0, vatRate: 0 },
    ],
    suppliers: [
      { id: 1, name: "Moda Süt", phone: "0532 000 00 00", category: "dairy", notes: null, createdAt: at("2026-07-01T00:00:00Z") },
      { id: 2, name: "Ev sahibi", phone: null, category: "other", notes: "Kira", createdAt: at("2026-07-01T00:00:00Z") },
    ],
    expenses: [
      // A delivery: 10 L of milk and 2 kg of coffee.
      expense(1, 1_400, 1_400, "ingredients", "2026-10-01T21:00:00Z", { sourceType: "purchase_receipt", sourcePurchaseReceiptId: 1, supplierId: 1 }),
      expense(2, 30_000, 20_000, "rent", "2026-09-30T21:00:00Z", { supplierId: 2, dueDate: at("2026-10-05T00:00:00Z") }),
      expense(3, 500, 500, "supplies", "2026-10-10T21:00:00Z"),
      expense(4, 750, 750, "supplies", "2026-10-11T21:00:00Z"),
      // Marked paid before Shelby kept payments.
      expense(5, 300, 300, "other", "2026-07-15T21:00:00Z", { paymentMethod: "cash" }),
      expense(6, 6_000, 6_000, "wages", "2026-10-12T00:00:00Z", { sourceType: "timesheet_wages", sourceScheduleId: 1 }),
      expense(7, 8_000, 8_000, "rent", "2026-04-30T21:00:00Z"),
    ],
    expensePayments: [
      pay(1, 1, 1_400, "bank_transfer", "2026-10-02T09:00:00Z"),
      pay(2, 2, 10_000, "check", "2026-10-01T09:00:00Z"),
      pay(3, 2, 10_000, "cash", "2026-10-01T09:00:00Z", { cashAccount: "safe" }),
      pay(4, 3, 500, "borrowed_manager", "2026-10-11T09:00:00Z", { borrowedFromUserId: MANAGER }),
      pay(5, 4, 750, "shelby_card", "2026-10-12T09:00:00Z"),
      pay(6, 6, 6_000, "cash", "2026-10-19T08:00:00Z"),
    ],
    expenseChecks: [
      {
        id: 1,
        expenseId: 2,
        expensePaymentId: 2,
        checkNumber: "A-0012",
        drawerName: "Shelby Sokak",
        amount: 10_000,
        dueDate: at("2026-11-15T00:00:00Z"),
        notes: null,
        isPaid: false,
        paidAt: null,
        createdAt: at("2026-10-01T09:00:00Z"),
      },
    ],
    debtRepayments: [
      {
        id: 1,
        lenderUserId: MANAGER,
        lenderName: null,
        amount: 200,
        method: "cash",
        cashAccount: "safe",
        notes: null,
        paidAt: at("2026-10-15T09:00:00Z"),
        createdAt: at("2026-10-15T09:00:00Z"),
      },
    ],
    card: { name: "Kafe kartı", creditLimit: 100_000, statementDay: 26, paymentDay: 5, enabled: true, updatedAt: at("2026-07-01T00:00:00Z") },
    cardPayments: [
      {
        id: 1,
        amount: 300,
        method: "bank_transfer",
        cashAccount: null,
        notes: null,
        paidAt: at("2026-10-14T09:00:00Z"),
        createdAt: at("2026-10-14T09:00:00Z"),
      },
    ],
    receipts: [
      {
        id: 1,
        receivedAt: at("2026-10-01T00:00:00Z"),
        invoiceNumber: "MS-2210",
        notes: null,
        financialMode: "create_paid_expense",
        totalAmount: 1_400,
        supplierId: 1,
        createdByUserId: MANAGER,
        createdAt: at("2026-10-01T10:00:00Z"),
        updatedAt: at("2026-10-01T10:00:00Z"),
      },
    ],
    receiptLines: [
      { id: 1, receiptId: 1, stockItemId: 1, quantity: 10_000, unitCost: 0.04, lineTotal: 400, itemNameSnapshot: "Süt", unitSnapshot: "ml" },
      { id: 2, receiptId: 1, stockItemId: 2, quantity: 2, unitCost: 500, lineTotal: 1_000, itemNameSnapshot: "Kahve", unitSnapshot: "kg" },
    ],
    stockCategories: [],
    stockItems: [
      {
        id: 1,
        name: "Süt",
        kind: "ingredient",
        unit: "ml",
        currentStock: 6_500,
        minStock: 2_000,
        costPerUnit: 0.04,
        categoryId: 1,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
      {
        id: 2,
        name: "Kahve",
        kind: "ingredient",
        unit: "kg",
        currentStock: 1.75,
        minStock: 0.5,
        costPerUnit: 500,
        categoryId: 1,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
      {
        id: 3,
        name: "Cheesecake dilim",
        kind: "direct_sale",
        unit: "slice",
        currentStock: -2,
        minStock: 4,
        costPerUnit: 45,
        categoryId: 1,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
    ],
    stockLogs: [],
    ingredients: [
      { productId: 10, stockItemId: 1, quantity: 200 },
      { productId: 10, stockItemId: 2, quantity: 0.018 },
    ],
    shiftTemplates: [{ id: 1, name: "Sabah", startTime: "08:00", endTime: "16:00" }],
    schedules: [
      // A newer week (Sunday 00:00Z meaning Monday 12 October) and an old one with templates.
      {
        id: 1,
        weekStart: at("2026-10-11T00:00:00Z"),
        status: "approved",
        approvedById: ADMIN,
        approvedAt: at("2026-10-09T12:00:00Z"),
        createdAt: at("2026-10-08T12:00:00Z"),
      },
      {
        id: 2,
        weekStart: at("2026-09-28T00:00:00Z"),
        status: "approved",
        approvedById: ADMIN,
        approvedAt: at("2026-09-25T12:00:00Z"),
        createdAt: at("2026-09-25T12:00:00Z"),
      },
    ],
    shiftAssignments: [
      { id: 1, scheduleId: 2, shiftTemplateId: 1, userId: BARISTA, dayOfWeek: 0, notes: null },
      { id: 2, scheduleId: 2, shiftTemplateId: 1, userId: MANAGER, dayOfWeek: 0, notes: null },
    ],
    shiftBlocks: [
      {
        id: 1,
        scheduleId: 1,
        dayOfWeek: 0,
        startMinutes: 480,
        endMinutes: 960,
        notes: null,
        createdAt: at("2026-10-08T12:00:00Z"),
        updatedAt: at("2026-10-08T12:00:00Z"),
      },
      {
        id: 2,
        scheduleId: 1,
        dayOfWeek: 2,
        startMinutes: 600,
        endMinutes: 840,
        notes: "Kısa",
        createdAt: at("2026-10-08T12:00:00Z"),
        updatedAt: at("2026-10-08T12:00:00Z"),
      },
    ],
    shiftBlockAssignments: [
      { shiftBlockId: 1, userId: BARISTA },
      { shiftBlockId: 2, userId: BARISTA },
      { shiftBlockId: 1, userId: MANAGER },
    ],
    timesheets: [
      // 12 hours over a day of 8 and one of 4; the rate went up that week.
      { id: 1, scheduleId: 1, userId: BARISTA, hoursWorked: 12.5, hourlyRate: 130, totalPay: 1_625 },
      { id: 2, scheduleId: 1, userId: MANAGER, hoursWorked: 8, hourlyRate: 150, totalPay: 1_200 },
      { id: 3, scheduleId: 2, userId: BARISTA, hoursWorked: 8, hourlyRate: 120, totalPay: 960 },
    ],
    payrollPayouts: [
      {
        id: 1,
        timesheetEntryId: 3,
        expensePaymentId: null,
        amount: 960,
        method: "cash",
        notes: null,
        paidAt: at("2026-10-05T09:00:00Z"),
        createdByUserId: ADMIN,
        createdAt: at("2026-10-05T09:00:00Z"),
      },
      {
        id: 2,
        timesheetEntryId: 1,
        expensePaymentId: null,
        amount: 1_000,
        method: "bank_transfer",
        notes: "Avans",
        paidAt: at("2026-10-17T09:00:00Z"),
        createdByUserId: ADMIN,
        createdAt: at("2026-10-17T09:00:00Z"),
      },
    ],
    payrollPeriods: [
      {
        id: 1,
        monthStart: at("2026-09-01T00:00:00Z"),
        status: "closed",
        closedAt: at("2026-10-02T09:00:00Z"),
        closedByUserId: ADMIN,
        closeNote: null,
        reopenedAt: null,
        reopenedByUserId: null,
        reopenReason: null,
      },
    ],
    payrollAllocations: [],
    taskLists: [
      {
        id: 1,
        name: "Açılış",
        description: null,
        assignmentMode: "target_role",
        active: true,
        archivedAt: null,
        createdAt: at("2026-07-01T00:00:00Z"),
        updatedAt: at("2026-07-01T00:00:00Z"),
      },
    ],
    taskItems: [
      {
        id: 1,
        taskListId: 1,
        title: "Makineyi ısıt",
        description: null,
        dayOfWeek: 0,
        targetRole: "barista",
        sortOrder: 0,
        active: true,
        archivedAt: null,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
      {
        id: 2,
        taskListId: 1,
        title: "Kasayı say",
        description: "Bozuklukları da",
        dayOfWeek: 6,
        targetRole: "manager",
        sortOrder: 1,
        active: true,
        archivedAt: null,
        createdAt: at("2026-07-01T00:00:00Z"),
      },
    ],
    taskOccurrences: [
      {
        taskListItemId: 1,
        dateKey: "2026-10-12",
        listNameSnapshot: "Açılış",
        titleSnapshot: "Makineyi ısıt",
        status: "completed",
        note: null,
        completedAt: at("2026-10-12T05:10:00Z"),
        completedByUserId: BARISTA,
        updatedAt: at("2026-10-12T05:10:00Z"),
      },
      {
        taskListItemId: 2,
        dateKey: "2026-10-18",
        listNameSnapshot: "Açılış",
        titleSnapshot: "Kasayı say",
        status: "overdue",
        note: null,
        completedAt: null,
        completedByUserId: null,
        updatedAt: at("2026-10-18T20:00:00Z"),
      },
    ],
    rolePermissions: [{ role: "barista", resource: "page:/expenses", allowed: false }],
    moneyAccounts: [
      { kind: "drawer", balance: 1_850 },
      { kind: "safe", balance: 12_000 },
      { kind: "bank", balance: 48_250.75 },
    ],
    moneyMovements: [],
    cashSessions: [
      {
        id: "cs1",
        openedAt: at("2026-10-17T05:00:00Z"),
        openedById: MANAGER,
        openingExpected: 1_500,
        openingCount: 1_500,
        openingDifference: 0,
        openingNote: null,
        closedAt: at("2026-10-18T18:00:00Z"),
        closedById: MANAGER,
        closingExpected: 1_860,
        closingCount: 1_850,
        closingDifference: -10,
        closingNote: "Bozuk para",
        openRequestKey: "o1",
        closeRequestKey: "c1",
      },
    ],
    accountingPeriods: [
      {
        id: "old",
        label: "Önceki sahip",
        startsAt: at("2026-01-01T00:00:00Z"),
        endsAt: at("2026-06-24T21:00:00Z"),
        status: "closed",
        closedAt: at("2026-06-25T00:00:00Z"),
      },
      { id: "new", label: "Yeni", startsAt: at("2026-06-24T21:00:00Z"), endsAt: null, status: "open", closedAt: null },
    ],
    attachments: [
      { id: "a1", expenseId: 1, pathname: "x/fatura.pdf", originalFilename: "fatura.pdf", contentType: "application/pdf", byteSize: 1000, status: "ready" },
    ],
    counts: { aiConversations: 3, operationalAlerts: 5, inventoryLogs: 0, posConfig: 1 },
  };
}

const NOW = at("2026-10-19T06:00:00Z");
let hash: string;
let snap: ShelbySnapshot;
let mapped: Mapped;
let stores: PeniStores;

beforeEach(async () => {
  hash ??= await bcrypt.hash(PASSWORD, 4);
  snap = snapshot(hash);
  mapped = mapShelby(snap, { cafeId: "cafe_shelby", slug: "shelby", now: NOW });
  stores = inMemoryStores();
});

describe("Shelby → Penny (plan piece 33)", { timeout: 30_000 }, () => {
  it("reads Shelby's units and weeks as Penny's", () => {
    expect(unitOf("ml")).toEqual({ unit: "l", factor: 0.001 });
    expect(unitOf("slice").unit).toBe("adet");
    expect(milliOf(200, "ml")).toBe(200);
    expect(milliOf(1.75, "kg")).toBe(1_750);
    expect(mondayOf(at("2026-10-11T00:00:00Z"))).toBe("2026-10-12");
    expect(mondayOf(at("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
  });

  it("moves the new owner's records and says what stays in Shelby", () => {
    const { records: r, report } = mapped;
    expect(report.from).toBe("2026-06-25");
    expect(r.orders.map((o) => o.createKey)).not.toContain("shelby:ORD-20260501-0007");
    expect(r.orders).toHaveLength(5);
    expect(r.bills.map((b) => b.id).sort()).toEqual(["shelby_e1", "shelby_e2", "shelby_e3", "shelby_e4", "shelby_e5"]);
    expect(report.notMoved.map((n) => n.what)).toEqual(
      expect.arrayContaining([
        "Orders never paid (pending)",
        "Weekly wage bills",
        "Records from before 2026-06-25",
        "Bill photos and PDFs",
        "Closed pay months",
        "Role permission changes",
      ]),
    );
    expect(report.warnings.join("\n")).toMatch(/below zero/);
    expect(report.warnings.join("\n")).toMatch(/lost some of their lines/);

    // Everything, when asked.
    expect(mapShelby(snap, { cafeId: "cafe_shelby", slug: "shelby", now: NOW, from: null }).records.orders).toHaveLength(6);
  });

  it("keeps each record's meaning", () => {
    const r = mapped.records;
    expect(r.members.map((m) => m.role)).toEqual(["owner", "manager", "barista"]);
    expect(r.accounts[0]!.email).toBe("mehmet@shelby.test");

    const refunded = r.orders.find((o) => o.createKey === "shelby:ORD-20261018-0003")!;
    expect(refunded).toMatchObject({
      status: "refunded",
      totalKurus: 15_000,
      refundKurus: 15_000,
      refundReason: "Yanlış sipariş",
      refundedByMemberId: "shelby_m" + MANAGER,
    });
    expect(r.payments.filter((p) => p.orderId === refunded.id).map((p) => [p.kind, p.amountKurus])).toEqual([
      ["sale", 15_000],
      ["refund", 15_000],
    ]);
    // A 10 % order discount; the payment is what was paid.
    expect(r.orders.find((o) => o.createKey.endsWith("0002"))).toMatchObject({ subtotalKurus: 17_500, discountKurus: 1_750, totalKurus: 15_750 });
    // No paidAt in old Shelby: paid when it was made. Cash on a day the drawer was open finds its session.
    const old = r.orders.find((o) => o.createKey.endsWith("0006"))!;
    expect(old.paidAt).toEqual(at("2026-09-01T09:00:00Z"));
    expect(r.payments.find((p) => p.orderId === "shelby_o1")!.cashSessionId).toBe("shelby_cs_cs1");

    // The delivery's lines carry stock; the café's card, the manager's money and a check.
    const milk = r.bills.find((b) => b.id === "shelby_e1")!;
    expect(milk.lines).toEqual([
      { itemId: "shelby_s1", name: "Süt", category: "ingredients", qtyMilli: 10_000, totalKurus: 40_000 },
      { itemId: "shelby_s2", name: "Kahve", category: "ingredients", qtyMilli: 2_000, totalKurus: 100_000 },
    ]);
    expect(milk).toMatchObject({ number: "MS-2210", date: "2026-10-02", paidKurus: 140_000 });
    expect(r.billPayments.map((p) => p.method)).toEqual(["bank", "check", "cash", "loan", "credit", "cash"]);
    expect(r.checks[0]).toMatchObject({ number: "A-0012", dueDate: "2026-11-15", cashedOn: null, payee: "Ev sahibi", note: "Keşideci: Shelby Sokak" });
    expect(r.loans[0]).toMatchObject({ lenderKey: "member:shelby_m" + MANAGER, lenderName: "Ayşe Kaya", amountKurus: 50_000 });

    // Stock in Peni's units, never below zero; Shelby's cost per gram as Peni's per litre.
    expect(r.stockItems.map((s) => [s.name, s.unit, s.costKurus])).toEqual([
      ["Süt", "l", 4_000],
      ["Kahve", "kg", 50_000],
      ["Cheesecake dilim", "adet", 4_500],
    ]);
    expect(r.stockStart!.changes.map((c) => ("countedMilli" in c ? c.countedMilli : null))).toEqual([6_500, 1_750, 0]);
    expect(r.recipes.map((x) => [x.productId, x.mode, x.lines])).toEqual([
      [
        "shelby_p10",
        "recipe",
        [
          { itemId: "shelby_s1", qtyMilli: 200 },
          { itemId: "shelby_s2", qtyMilli: 18 },
        ],
      ],
      ["shelby_p11", "recipe", [{ itemId: "shelby_s3", qtyMilli: 1_000 }]],
      ["shelby_p12", "none", []],
    ]);

    // A week's hours on the planned days; the newer week from blocks, the older from templates.
    const can = r.workDays.filter((w) => w.memberId === "shelby_m" + BARISTA).map((w) => [w.day, w.minutes]);
    expect(can).toEqual([
      ["2026-10-12", 500],
      ["2026-10-14", 250],
      ["2026-09-28", 480],
    ]);
    expect(r.shifts.find((s) => s.id.startsWith("shelby_sa"))).toMatchObject({ day: "2026-09-28", startMinutes: 480, endMinutes: 960, note: "Sabah" });
    expect(r.rates.filter((x) => x.memberId === "shelby_m" + BARISTA).map((x) => [x.fromDay, x.kurusPerHour])).toEqual([
      ["2026-09-28", 12_000],
      ["2026-10-12", 13_000],
    ]);
    expect(r.payouts.map((p) => [p.month, p.amountKurus, p.method])).toEqual([
      ["2026-09", 96_000, "cash"],
      ["2026-10", 100_000, "bank"],
    ]);

    // A list with tasks for two roles becomes a list per role; Monday is 1.
    expect(r.taskLists.map((l) => [l.name, l.assign])).toEqual([
      ["Açılış · Barista", "barista"],
      ["Açılış · Müdür", "manager"],
    ]);
    expect(r.taskItems.map((i) => i.days)).toEqual([[1], [7]]);
    expect(r.taskChecks).toHaveLength(1);

    // Money starts today with Shelby's balances.
    expect(r.movements.map((m) => [m.account, m.amountKurus])).toEqual([
      ["reserve", 1_200_000],
      ["bank", 4_825_075],
    ]);
  });

  it("writes into Penny, where every total matches Shelby's and the team signs in as before", async () => {
    await writeShelby(stores, mapped.records);
    const rows = await checkMove(snap, stores, "cafe_shelby");
    expect(rows.filter((x) => !x.ok)).toEqual([]);
    expect(rows.find((x) => x.label === "credit card")).toMatchObject({ shelby: 45_000, peni: 45_000 });
    expect(rows.find((x) => x.label === `loans from ayşe kaya`)).toMatchObject({ peni: 30_000 });
    expect(reportMarkdown(mapped.report, rows, { when: NOW, mode: "Dry run" })).toContain("**Every total matches.**");

    const app = new PeniApp({ demo: false, bcryptRounds: 4, clock: () => NOW }, stores);
    const session = await app.staff.signIn("Mehmet@shelby.test", PASSWORD);
    const owner = await app.staff.at(session.token, "shelby");
    expect(owner.member.role).toBe("owner");
    const money = await app.money.get(owner);
    expect([money.drawer.balanceKurus, money.reserveKurus, money.bankKurus]).toEqual([185_000, 1_200_000, 4_825_075]);
    expect((await app.stock.view(owner)).items.find((i) => i.name === "Kahve")).toMatchObject({ qtyMilli: 1_750 });
  });

  it("only moves into an empty café", async () => {
    await writeShelby(stores, mapped.records);
    await expect(writeShelby(stores, mapped.records)).rejects.toThrow(/already has the café/);
  });

  it("finds a total that doesn't match", async () => {
    await writeShelby(stores, mapped.records);
    snap.orders[0]!.total = 250;
    const rows = await checkMove(snap, stores, "cafe_shelby");
    expect(rows.filter((x) => !x.ok).map((x) => x.label)).toEqual(["2026-10", "by cash"]);
  });
});
