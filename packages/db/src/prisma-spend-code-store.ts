import type { SpendCode, SpendCodeStore } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

export class PrismaSpendCodeStore implements SpendCodeStore {
  constructor(private readonly db: Db) {}

  async saveSpendCode(code: SpendCode): Promise<boolean> {
    try {
      await this.db().spendCode.upsert({ where: { membershipId: code.membershipId }, create: code, update: code });
      return true;
    } catch (error) {
      // Another member of the café holds these digits; the caller picks others.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async getSpendCode(cafeId: string, code: string): Promise<SpendCode | null> {
    return this.db().spendCode.findUnique({ where: { cafeId_code: { cafeId, code } } });
  }
}
