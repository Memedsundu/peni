import type { Bill, BillPayMethod, BillPayment, BillQuery, BillStore, LastPrice, Supplier } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type PrismaClient, type BillLine as LineRow, type BillPayment as PaymentRow, type Bill as BillRow } from "./generated/client";

type Tx = Prisma.TransactionClient;

const withLines = { lines: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { createdAt: "asc" } } } as const;

function toBill(r: BillRow & { lines: LineRow[]; payments: PaymentRow[] }): Bill {
  return {
    id: r.id,
    cafeId: r.cafeId,
    supplierId: r.supplierId,
    number: r.number,
    date: r.date,
    dueDate: r.dueDate,
    note: r.note,
    lines: r.lines.map((l) => ({ itemId: l.itemId, name: l.name, category: l.category, qtyMilli: l.qtyMilli, totalKurus: l.totalKurus })),
    totalKurus: r.totalKurus,
    paidKurus: r.paidKurus,
    paidAt: r.paidAt,
    payments: r.payments.map(toPayment),
    version: r.version,
    voidedAt: r.voidedAt,
    voidedById: r.voidedById,
    voidReason: r.voidReason,
    createdById: r.createdById,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createKey: r.createKey,
  };
}

function toPayment(p: PaymentRow): BillPayment {
  return {
    id: p.id,
    cafeId: p.cafeId,
    billId: p.billId,
    amountKurus: p.amountKurus,
    method: p.method,
    paidOn: p.paidOn,
    memberId: p.memberId,
    createdAt: p.createdAt,
  };
}

function where(cafeId: string, q: BillQuery): Prisma.BillWhereInput {
  return {
    cafeId,
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.itemId ? { lines: { some: { itemId: q.itemId } } } : {}),
    ...(q.from || q.to ? { date: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.unpaid ? { voidedAt: null, paidAt: null } : q.includeVoided ? {} : { voidedAt: null }),
  };
}

const newestFirst = [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }] as const satisfies Prisma.BillOrderByWithRelationInput[];

export class PrismaBillStore implements BillStore {
  constructor(private readonly db: Db) {}

  async listSuppliers(cafeId: string, opts: { includeArchived?: boolean } = {}): Promise<Supplier[]> {
    const rows = await this.db().supplier.findMany({ where: { cafeId, ...(opts.includeArchived ? {} : { archivedAt: null }) } });
    return rows.sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }

  async getSupplier(cafeId: string, id: string): Promise<Supplier | null> {
    return this.db().supplier.findFirst({ where: { id, cafeId } });
  }

  async saveSupplier(s: Supplier): Promise<void> {
    await this.db().supplier.upsert({ where: { id: s.id }, create: s, update: s });
  }

  async listBills(cafeId: string, query: BillQuery = {}): Promise<Bill[]> {
    const rows = await this.db().bill.findMany({ where: where(cafeId, query), include: withLines, orderBy: [...newestFirst], take: query.limit });
    return rows.map(toBill);
  }

  async getBill(cafeId: string, id: string): Promise<Bill | null> {
    const r = await this.db().bill.findFirst({ where: { id, cafeId }, include: withLines });
    return r ? toBill(r) : null;
  }

  async findBillByKey(cafeId: string, createKey: string): Promise<Bill | null> {
    const r = await this.db().bill.findUnique({ where: { cafeId_createKey: { cafeId, createKey } }, include: withLines });
    return r ? toBill(r) : null;
  }

  async saveBill(bill: Bill): Promise<void> {
    const { lines, payments: _payments, ...details } = bill;
    const run = async (tx: Tx) => {
      await tx.bill.upsert({ where: { id: bill.id }, create: details, update: details });
      await tx.billLine.deleteMany({ where: { billId: bill.id } });
      await tx.billLine.createMany({ data: lines.map((l, i) => ({ ...l, billId: bill.id, sortOrder: i })) });
    };
    const db = this.db();
    if ("$transaction" in db) await (db as PrismaClient).$transaction(run);
    else await run(db);
  }

  async addPayment(p: BillPayment): Promise<void> {
    await this.db().billPayment.create({ data: p });
  }

  async getPayment(cafeId: string, id: string): Promise<BillPayment | null> {
    const p = await this.db().billPayment.findFirst({ where: { id, cafeId } });
    return p ? toPayment(p) : null;
  }

  async removePayment(cafeId: string, id: string): Promise<void> {
    await this.db().billPayment.deleteMany({ where: { id, cafeId } });
  }

  async listPayments(cafeId: string, opts: { method?: BillPayMethod } = {}): Promise<BillPayment[]> {
    const rows = await this.db().billPayment.findMany({
      where: { cafeId, ...(opts.method ? { method: opts.method } : {}) },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toPayment);
  }

  async lastPrice(cafeId: string, itemId: string): Promise<LastPrice | null> {
    const line = await this.db().billLine.findFirst({
      where: { itemId, totalKurus: { gt: 0 }, qtyMilli: { gt: 0 }, bill: { cafeId, voidedAt: null } },
      orderBy: [{ bill: { date: "desc" } }, { bill: { createdAt: "desc" } }, { billId: "desc" }],
      select: { billId: true, qtyMilli: true, totalKurus: true, bill: { select: { date: true } } },
    });
    return line ? { billId: line.billId, date: line.bill.date, qtyMilli: line.qtyMilli!, totalKurus: line.totalKurus } : null;
  }
}
