import type { Payment, PaymentStore, TerminalData } from "@peni/core";
import type { Db } from "./db";
import { Prisma, type Payment as Row } from "./generated/client";

function toPayment(row: Row): Payment {
  return { ...row, terminalData: (row.terminalData as TerminalData | null) ?? null };
}

export class PrismaPaymentStore implements PaymentStore {
  constructor(private readonly db: Db) {}

  async savePayment(payment: Payment): Promise<boolean> {
    const data = { ...payment, terminalData: payment.terminalData ? (payment.terminalData as unknown as Prisma.InputJsonValue) : Prisma.DbNull };
    try {
      await this.db().payment.upsert({ where: { id: payment.id }, create: data, update: data });
      return true;
    } catch (error) {
      // The key is taken at this café: a double tap, and the other one was kept.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async getPayment(cafeId: string, id: string): Promise<Payment | null> {
    const row = await this.db().payment.findFirst({ where: { id, cafeId } });
    return row ? toPayment(row) : null;
  }

  async findPaymentByKey(cafeId: string, key: string): Promise<Payment | null> {
    const row = await this.db().payment.findUnique({ where: { cafeId_key: { cafeId, key } } });
    return row ? toPayment(row) : null;
  }

  async listPayments(cafeId: string, orderIds: string[]): Promise<Payment[]> {
    const rows = await this.db().payment.findMany({ where: { cafeId, orderId: { in: orderIds } }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
    return rows.map(toPayment);
  }

  async listCashSessionPayments(cafeId: string, cashSessionId: string): Promise<Payment[]> {
    const rows = await this.db().payment.findMany({ where: { cafeId, cashSessionId }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
    return rows.map(toPayment);
  }

  async listSettled(cafeId: string, from: Date, to: Date): Promise<Payment[]> {
    const rows = await this.db().payment.findMany({
      where: { cafeId, status: "approved", settledAt: { gte: from, lt: to } },
      orderBy: [{ settledAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toPayment);
  }
}
