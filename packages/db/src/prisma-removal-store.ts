import { peniHistory, type CafeRemovalStore, type RemovedCafe } from "@peni/core";
import type { Db } from "./db";
import type { Prisma, PrismaClient } from "./generated/client";

/**
 * Deletes a café and everything in it (N13). Almost every table goes with the café
 * (`onDelete: Cascade`); this deletes first what doesn't: gifts and members' reports, which
 * keep a café id without a link, and the rows a link stops the cascade at (`Restrict`:
 * recipe and bill lines on a stock item, bills on a supplier, checks and loans on a bill
 * payment). The peni ledger is never deleted (the database refuses it), so a café with
 * peni history is refused. Runs in the open transaction when there is one.
 */
export class PrismaCafeRemovalStore implements CafeRemovalStore {
  constructor(private readonly db: Db) {}

  async removeCafe(cafeId: string): Promise<RemovedCafe> {
    const run = async (tx: Prisma.TransactionClient): Promise<RemovedCafe> => {
      const history = await tx.ledgerTransaction.count({ where: { cafeId } });
      if (history) throw new Error(peniHistory(cafeId, history));
      const people = (await tx.staffMember.findMany({ where: { cafeId }, select: { accountId: true } })).map((m) => m.accountId);

      await tx.gift.deleteMany({ where: { cafeId } });
      await tx.contentReport.deleteMany({ where: { cafeId } });

      await tx.stockRecipeLine.deleteMany({ where: { cafeId } });
      await tx.billLine.deleteMany({ where: { bill: { cafeId } } });
      await tx.debtCheck.deleteMany({ where: { cafeId } });
      await tx.loan.deleteMany({ where: { cafeId } });
      await tx.bill.deleteMany({ where: { cafeId } });
      await tx.cafe.deleteMany({ where: { id: cafeId } });

      const gone = await tx.staffAccount.deleteMany({ where: { id: { in: people }, memberships: { none: {} } } });
      return { accountsRemoved: gone.count, accountsKept: people.length - gone.count };
    };
    const db = this.db();
    return "$transaction" in db ? (db as PrismaClient).$transaction(run) : run(db);
  }
}
