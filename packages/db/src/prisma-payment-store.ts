import type { Payment, PaymentStore } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

export class PrismaPaymentStore implements PaymentStore {
  constructor(private readonly db: Db) {}

  async savePayment(payment: Payment): Promise<boolean> {
    try {
      await this.db().payment.upsert({ where: { id: payment.id }, create: payment, update: payment });
      return true;
    } catch (error) {
      // The key is taken at this café: a double tap, and the other one was kept.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async getPayment(cafeId: string, id: string): Promise<Payment | null> {
    return this.db().payment.findFirst({ where: { id, cafeId } });
  }

  async findPaymentByKey(cafeId: string, key: string): Promise<Payment | null> {
    return this.db().payment.findUnique({ where: { cafeId_key: { cafeId, key } } });
  }

  async listPayments(cafeId: string, orderIds: string[]): Promise<Payment[]> {
    return this.db().payment.findMany({ where: { cafeId, orderId: { in: orderIds } }, orderBy: [{ startedAt: "asc" }, { id: "asc" }] });
  }
}
