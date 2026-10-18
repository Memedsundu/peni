import type { ClaimStore, PeniClaim } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

export class PrismaClaimStore implements ClaimStore {
  constructor(private readonly db: Db) {}

  async saveClaim(claim: PeniClaim): Promise<boolean> {
    try {
      await this.db().peniClaim.upsert({ where: { id: claim.id }, create: claim, update: claim });
      return true;
    } catch (error) {
      // The code is taken that day; the caller picks another.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async getClaimByOrder(cafeId: string, orderId: string): Promise<PeniClaim | null> {
    return this.db().peniClaim.findFirst({ where: { cafeId, orderId } });
  }

  async codesUsed(cafeId: string, businessDay: string): Promise<Set<string>> {
    const rows = await this.db().peniClaim.findMany({ where: { cafeId, businessDay }, select: { code: true } });
    return new Set(rows.map((r) => r.code));
  }
}
