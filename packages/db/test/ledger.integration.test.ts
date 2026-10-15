import { execSync } from "node:child_process";
import { InMemoryDirectory, Ledger, PeniService, account, defaultSettings } from "@peni/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, PrismaLedgerStore, type PrismaClient } from "../src";

// Runs against a real, disposable Postgres when TEST_DATABASE_URL is set; skipped otherwise.
// Never wipes data: migrations are applied idempotently and every run uses fresh café ids.
const url = process.env.TEST_DATABASE_URL;
const run = Math.random().toString(36).slice(2, 8);

describe.skipIf(!url)("PrismaLedgerStore against Postgres", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
    prisma = createPrismaClient(url);
  });
  afterAll(() => prisma?.$disconnect());

  it("runs the askı flow and keeps balances in step with entries", async () => {
    const directory = new InMemoryDirectory();
    directory.settings.set(`c1_${run}`, { ...defaultSettings(`c1_${run}`), askidaProductIds: ["cay"] });
    const joinedAt = new Date("2026-01-01");
    for (const id of ["ayse", "ogrenci"]) {
      await directory.saveMembership({ id: `${id}_${run}`, cafeId: `c1_${run}`, customerId: id, joinedAt, blocked: false, preorderEnabled: true, consecutiveNoShows: 0 });
    }
    const ledger = new Ledger(new PrismaLedgerStore(prisma));
    const service = new PeniService(ledger, directory);

    await service.earnForPaidOrder({ membershipId: `ayse_${run}`, orderId: `o1_${run}`, paidTotalKurus: 200_000 }); // 100 peni
    await service.earnForPaidOrder({ membershipId: `ayse_${run}`, orderId: `o1_${run}`, paidTotalKurus: 200_000 }); // replay
    await service.donateToAskida({ membershipId: `ayse_${run}`, peni: 60, showName: false, idempotencyKey: `d1_${run}` });
    await service.claimFromAskida({ membershipId: `ogrenci_${run}`, orderId: `o2_${run}`, productId: "cay", unitPriceKurus: 3_000 });

    expect(await service.walletBalance(`ayse_${run}`)).toBe(40);
    expect(await ledger.balance(account.askida(`c1_${run}`))).toBe(30);

    const sums = await prisma.$queryRaw<{ account: string; sum: bigint }[]>`
      SELECT e.account, SUM(e.delta) AS sum FROM "LedgerEntry" e
      JOIN "LedgerTransaction" t ON t.id = e."transactionId"
      WHERE t."cafeId" = ${`c1_${run}`} GROUP BY e.account`;
    for (const { account: acc, sum } of sums) {
      expect(await ledger.balance(acc)).toBe(Number(sum));
    }
  });

  it("never overdraws under concurrent spends", async () => {
    const directory = new InMemoryDirectory();
    await directory.saveMembership({ id: `can_${run}`, cafeId: `c2_${run}`, customerId: "can", joinedAt: new Date(), blocked: false, preorderEnabled: true, consecutiveNoShows: 0 });
    const ledger = new Ledger(new PrismaLedgerStore(prisma));
    const service = new PeniService(ledger, directory);
    await service.earnForPaidOrder({ membershipId: `can_${run}`, orderId: `seed_${run}`, paidTotalKurus: 100_000 }); // 50 peni

    const line = [{ productId: "latte", unitPriceKurus: 5_000, quantity: 1 }];
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => service.redeemForOrder({ membershipId: `can_${run}`, orderId: `r${i}_${run}`, lines: line, requestedPeni: 50 })),
    );
    expect(results.filter((r) => r.appliedPeni === 50)).toHaveLength(1);
    expect(await service.walletBalance(`can_${run}`)).toBe(0);
  });
});
