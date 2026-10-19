import pg from "pg";

/**
 * Shelby's records for one café, read as they are (plan piece 33). Money is in lira as
 * Shelby keeps it; Prisma's timestamps are UTC. Only reads: the move never writes to Shelby.
 */
export interface ShelbySnapshot {
  readAt: Date;
  cafe: {
    id: string;
    name: string;
    timezone: string;
    moneyInitializedAt: Date | null;
    vatRate: number;
    bankCommissionRate: number;
    createdAt: Date;
    /** Shelby's own pause on money writes: on from the switch-day freeze. Missing in older Shelby. */
    financialWritesPaused?: boolean;
  };
  users: { id: string; email: string; password: string; name: string; role: string; hourlyRate: number | null; createdAt: Date }[];
  categories: { id: number; name: string; sortOrder: number }[];
  products: {
    id: number;
    name: string;
    price: number;
    vatRate: number;
    image: string | null;
    active: boolean;
    trackingMode: "recipe" | "direct" | "untracked" | null;
    linkedStockItemId: number | null;
    categoryId: number;
    createdAt: Date;
  }[];
  orders: {
    id: number;
    orderNumber: string;
    status: string;
    paymentMethod: string | null;
    total: number;
    discountPercent: number;
    bankCommission: number;
    vatAmount: number;
    voidReason: string | null;
    voidedAt: Date | null;
    voidedByUserId: string | null;
    refundReason: string | null;
    refundedAt: Date | null;
    refundedByUserId: string | null;
    refundAmount: number | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  orderItems: { id: number; orderId: number; productId: number; quantity: number; unitPrice: number; discountPercent: number; vatRate: number }[];
  suppliers: { id: number; name: string; phone: string | null; category: string; notes: string | null; createdAt: Date }[];
  expenses: {
    id: number;
    amount: number;
    paidAmount: number;
    status: string;
    description: string;
    category: string;
    date: Date;
    dueDate: Date | null;
    isPaid: boolean;
    paymentMethod: string | null;
    borrowedFromName: string | null;
    borrowedFromUserId: string | null;
    sourceType: "manual" | "timesheet_wages" | "purchase_receipt";
    sourceScheduleId: number | null;
    sourcePurchaseReceiptId: number | null;
    supplierId: number | null;
    createdAt: Date;
  }[];
  expensePayments: {
    id: number;
    expenseId: number;
    amount: number;
    method: string;
    cashAccount: string | null;
    borrowedFromUserId: string | null;
    borrowedFromName: string | null;
    notes: string | null;
    paidAt: Date;
    createdAt: Date;
  }[];
  expenseChecks: {
    id: number;
    expenseId: number;
    expensePaymentId: number | null;
    checkNumber: string;
    drawerName: string;
    amount: number;
    dueDate: Date;
    notes: string | null;
    isPaid: boolean;
    paidAt: Date | null;
    createdAt: Date;
  }[];
  debtRepayments: {
    id: number;
    lenderUserId: string | null;
    lenderName: string | null;
    amount: number;
    method: string;
    cashAccount: string | null;
    notes: string | null;
    paidAt: Date;
    createdAt: Date;
  }[];
  card: { name: string; creditLimit: number; statementDay: number; paymentDay: number; enabled: boolean; updatedAt: Date } | null;
  cardPayments: { id: number; amount: number; method: string; cashAccount: string | null; notes: string | null; paidAt: Date; createdAt: Date }[];
  receipts: {
    id: number;
    receivedAt: Date;
    invoiceNumber: string | null;
    notes: string | null;
    financialMode: "stock_only" | "create_unpaid_expense" | "create_paid_expense";
    totalAmount: number;
    supplierId: number | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  receiptLines: {
    id: number;
    receiptId: number;
    stockItemId: number;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    itemNameSnapshot: string;
    unitSnapshot: string;
  }[];
  stockCategories: { id: number; name: string }[];
  stockItems: {
    id: number;
    name: string;
    kind: "ingredient" | "supply" | "direct_sale";
    unit: string;
    currentStock: number;
    minStock: number;
    costPerUnit: number;
    categoryId: number;
    createdAt: Date;
  }[];
  stockLogs: { id: number; stockItemId: number; change: number; reason: string; orderId: number | null; purchaseReceiptId: number | null; createdAt: Date }[];
  ingredients: { productId: number; stockItemId: number; quantity: number }[];
  shiftTemplates: { id: number; name: string; startTime: string; endTime: string }[];
  schedules: { id: number; weekStart: Date; status: string; approvedById: string | null; approvedAt: Date | null; createdAt: Date }[];
  shiftAssignments: { id: number; scheduleId: number; shiftTemplateId: number; userId: string; dayOfWeek: number; notes: string | null }[];
  shiftBlocks: {
    id: number;
    scheduleId: number;
    dayOfWeek: number;
    startMinutes: number;
    endMinutes: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  shiftBlockAssignments: { shiftBlockId: number; userId: string }[];
  timesheets: { id: number; scheduleId: number; userId: string; hoursWorked: number; hourlyRate: number; totalPay: number }[];
  payrollPayouts: {
    id: number;
    timesheetEntryId: number;
    expensePaymentId: number | null;
    amount: number;
    method: string;
    notes: string | null;
    paidAt: Date;
    createdByUserId: string | null;
    createdAt: Date;
  }[];
  payrollPeriods: {
    id: number;
    monthStart: Date;
    status: "open" | "closed";
    closedAt: Date | null;
    closedByUserId: string | null;
    closeNote: string | null;
    reopenedAt: Date | null;
    reopenedByUserId: string | null;
    reopenReason: string | null;
  }[];
  payrollAllocations: {
    payrollPeriodId: number;
    timesheetEntryId: number;
    userId: string;
    scheduleId: number;
    allocationRatio: number;
    allocatedHours: number;
    allocatedPay: number;
  }[];
  taskLists: {
    id: number;
    name: string;
    description: string | null;
    assignmentMode: "target_role" | "first_shift";
    active: boolean;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  taskItems: {
    id: number;
    taskListId: number;
    title: string;
    description: string | null;
    dayOfWeek: number;
    targetRole: string;
    sortOrder: number;
    active: boolean;
    archivedAt: Date | null;
    createdAt: Date;
  }[];
  taskOccurrences: {
    taskListItemId: number;
    dateKey: string;
    listNameSnapshot: string;
    titleSnapshot: string;
    status: "pending" | "completed" | "skipped" | "overdue";
    note: string | null;
    completedAt: Date | null;
    completedByUserId: string | null;
    updatedAt: Date;
  }[];
  rolePermissions: { role: string; resource: string; allowed: boolean }[];
  moneyAccounts: { kind: string; balance: number }[];
  moneyMovements: {
    id: string;
    account: string;
    amount: number;
    kind: string;
    sourceKey: string;
    operationKey: string;
    actorId: string;
    actorName: string;
    note: string | null;
    sessionId: string | null;
    createdAt: Date;
  }[];
  cashSessions: {
    id: string;
    openedAt: Date;
    openedById: string;
    openingExpected: number;
    openingCount: number;
    openingDifference: number;
    openingNote: string | null;
    closedAt: Date | null;
    closedById: string | null;
    closingExpected: number | null;
    closingCount: number | null;
    closingDifference: number | null;
    closingNote: string | null;
    openRequestKey: string;
    closeRequestKey: string | null;
  }[];
  accountingPeriods: { id: string; label: string; startsAt: Date; endsAt: Date | null; status: string; closedAt: Date | null }[];
  attachments: { id: string; expenseId: number; pathname: string; originalFilename: string; contentType: string; byteSize: number; status: string }[];
  /** Kept in Shelby only: counted so the report can say what wasn't moved. */
  counts: { aiConversations: number; operationalAlerts: number; inventoryLogs: number; posConfig: number };
}

/** The tables read per café, and what each becomes in the snapshot. */
const TABLES: [key: Exclude<keyof ShelbySnapshot, "readAt" | "cafe" | "card" | "counts">, sql: string][] = [
  ["users", `SELECT * FROM "User" WHERE "cafeId" = $1 ORDER BY "createdAt", id`],
  ["categories", `SELECT * FROM "Category" WHERE "cafeId" = $1 ORDER BY "sortOrder", id`],
  ["products", `SELECT * FROM "Product" WHERE "cafeId" = $1 ORDER BY id`],
  ["orders", `SELECT * FROM "Order" WHERE "cafeId" = $1 ORDER BY id`],
  ["orderItems", `SELECT i.* FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" WHERE o."cafeId" = $1 ORDER BY i.id`],
  ["suppliers", `SELECT * FROM "Supplier" WHERE "cafeId" = $1 ORDER BY id`],
  ["expenses", `SELECT * FROM "Expense" WHERE "cafeId" = $1 ORDER BY id`],
  ["expensePayments", `SELECT * FROM "ExpensePayment" WHERE "cafeId" = $1 ORDER BY id`],
  ["expenseChecks", `SELECT * FROM "ExpenseCheck" WHERE "cafeId" = $1 ORDER BY id`],
  ["debtRepayments", `SELECT * FROM "DebtRepayment" WHERE "cafeId" = $1 ORDER BY id`],
  ["cardPayments", `SELECT * FROM "CreditCardPayment" WHERE "cafeId" = $1 ORDER BY id`],
  ["receipts", `SELECT * FROM "PurchaseReceipt" WHERE "cafeId" = $1 ORDER BY id`],
  ["receiptLines", `SELECT * FROM "PurchaseReceiptLine" WHERE "cafeId" = $1 ORDER BY id`],
  ["stockCategories", `SELECT * FROM "StockCategory" WHERE "cafeId" = $1 ORDER BY id`],
  ["stockItems", `SELECT * FROM "StockItem" WHERE "cafeId" = $1 ORDER BY id`],
  ["stockLogs", `SELECT * FROM "StockLog" WHERE "cafeId" = $1 ORDER BY "createdAt", id`],
  ["ingredients", `SELECT * FROM "ProductIngredient" WHERE "cafeId" = $1 ORDER BY id`],
  ["shiftTemplates", `SELECT * FROM "ShiftTemplate" WHERE "cafeId" = $1 ORDER BY id`],
  ["schedules", `SELECT * FROM "WeeklySchedule" WHERE "cafeId" = $1 ORDER BY "weekStart"`],
  ["shiftAssignments", `SELECT * FROM "ShiftAssignment" WHERE "cafeId" = $1 ORDER BY id`],
  ["shiftBlocks", `SELECT * FROM "ShiftBlock" WHERE "cafeId" = $1 ORDER BY id`],
  ["shiftBlockAssignments", `SELECT * FROM "ShiftBlockAssignment" WHERE "cafeId" = $1 ORDER BY id`],
  ["timesheets", `SELECT * FROM "TimesheetEntry" WHERE "cafeId" = $1 ORDER BY id`],
  ["payrollPayouts", `SELECT * FROM "PayrollPayout" WHERE "cafeId" = $1 ORDER BY "paidAt", id`],
  ["payrollPeriods", `SELECT * FROM "PayrollPeriod" WHERE "cafeId" = $1 ORDER BY "monthStart"`],
  ["payrollAllocations", `SELECT * FROM "PayrollPeriodAllocation" WHERE "cafeId" = $1 ORDER BY id`],
  ["taskLists", `SELECT * FROM "TaskList" WHERE "cafeId" = $1 ORDER BY id`],
  ["taskItems", `SELECT * FROM "TaskListItem" WHERE "cafeId" = $1 ORDER BY id`],
  ["taskOccurrences", `SELECT * FROM "TaskOccurrence" WHERE "cafeId" = $1 ORDER BY "dateKey", id`],
  ["rolePermissions", `SELECT * FROM "RolePermission" WHERE "cafeId" = $1 ORDER BY id`],
  ["moneyAccounts", `SELECT * FROM "MoneyAccount" WHERE "cafeId" = $1 ORDER BY kind`],
  ["moneyMovements", `SELECT * FROM "MoneyMovement" WHERE "cafeId" = $1 ORDER BY "createdAt", id`],
  ["cashSessions", `SELECT * FROM "CashSession" WHERE "cafeId" = $1 ORDER BY "openedAt"`],
  ["accountingPeriods", `SELECT * FROM "AccountingPeriod" WHERE "cafeId" = $1 ORDER BY "startsAt"`],
  ["attachments", `SELECT * FROM "ExpenseAttachment" WHERE "cafeId" = $1 ORDER BY "createdAt"`],
];

/** Prisma writes `timestamp(3)` in UTC; read it as UTC whatever this machine's zone. Decimals become numbers. */
function clientFor(url: string): pg.Client {
  const client = new pg.Client({
    connectionString: url,
    types: {
      getTypeParser: ((oid: number, format?: "text" | "binary") => {
        if (oid === 1114) return (s: string) => new Date(`${s.replace(" ", "T")}Z`);
        if (oid === 1700) return (s: string) => Number(s);
        return pg.types.getTypeParser(oid, format as "text");
      }) as typeof pg.types.getTypeParser,
    },
  });
  return client;
}

/** The cafés in a Shelby database, to pick one when there are several. */
export async function listShelbyCafes(url: string): Promise<{ id: string; name: string }[]> {
  const client = clientFor(url);
  await client.connect();
  try {
    return (await client.query<{ id: string; name: string }>(`SELECT id, name FROM "Cafe" ORDER BY "createdAt"`)).rows;
  } finally {
    await client.end();
  }
}

/** Reads one café in a single read-only transaction, so every table is from the same moment. */
export async function readShelby(url: string, cafeId: string): Promise<ShelbySnapshot> {
  const client = clientFor(url);
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const cafe = (await client.query(`SELECT * FROM "Cafe" WHERE id = $1`, [cafeId])).rows[0];
    if (!cafe) throw new Error(`No café ${cafeId} in Shelby`);
    const out: Partial<ShelbySnapshot> = { readAt: new Date(), cafe };
    for (const [key, sql] of TABLES) (out as Record<string, unknown>)[key] = (await client.query(sql, [cafeId])).rows;
    out.card = (await client.query(`SELECT * FROM "CreditCardAccount" WHERE "cafeId" = $1`, [cafeId])).rows[0] ?? null;
    const count = async (sql: string) => Number((await client.query(sql, [cafeId])).rows[0].n);
    out.counts = {
      aiConversations: await count(`SELECT count(*) AS n FROM "AiConversation" WHERE "cafeId" = $1`),
      operationalAlerts: await count(`SELECT count(*) AS n FROM "OperationalAlert" WHERE "cafeId" = $1`),
      inventoryLogs: await count(`SELECT count(*) AS n FROM "InventoryLog" l JOIN "Product" p ON p.id = l."productId" WHERE p."cafeId" = $1`),
      posConfig: await count(`SELECT count(*) AS n FROM "PosConfig" WHERE "cafeId" = $1`),
    };
    await client.query("COMMIT");
    return out as ShelbySnapshot;
  } finally {
    await client.end();
  }
}

/**
 * Switch day (plan piece 35): stops Shelby taking money in or out for the café, with Shelby's
 * own pause (its triggers refuse every sale, payment and count while it's on, and its pages say
 * a period change is under way). `paused: false` lifts it again if the switch is called off.
 * Refuses to pause while Shelby's drawer is open, so the last count is the drawer's money.
 */
export async function pauseShelby(url: string, cafeId: string, paused: boolean): Promise<{ name: string; paused: boolean }> {
  const client = clientFor(url);
  await client.connect();
  try {
    await client.query("BEGIN");
    const cafe = (await client.query<{ name: string }>(`SELECT name FROM "Cafe" WHERE id = $1 FOR UPDATE`, [cafeId])).rows[0];
    if (!cafe) throw new Error(`No café ${cafeId} in Shelby`);
    if (paused) {
      const open = Number((await client.query(`SELECT count(*) AS n FROM "CashSession" WHERE "cafeId" = $1 AND "closedAt" IS NULL`, [cafeId])).rows[0].n);
      if (open) throw new Error("Shelby's drawer is still open: count and close it in Shelby (Kasa kapat) first");
    }
    await client.query(`UPDATE "Cafe" SET "financialWritesPaused" = $2 WHERE id = $1`, [cafeId, paused]);
    await client.query("COMMIT");
    return { name: cafe.name, paused };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
