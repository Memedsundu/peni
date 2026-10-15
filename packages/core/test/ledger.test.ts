import { describe, expect, it } from "vitest";
import { InMemoryLedgerStore, Ledger, PeniError, account } from "../src";

const ledger = () => new Ledger(new InMemoryLedgerStore());

describe("Ledger", () => {
  it("rejects unbalanced transactions", async () => {
    await expect(
      ledger().post({
        cafeId: "c",
        kind: "adjust",
        entries: [
          { account: account.issuance("c"), delta: -5 },
          { account: account.member("m"), delta: 4 },
        ],
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSACTION" });
  });

  it("rejects fractional peni", async () => {
    await expect(
      ledger().post({
        cafeId: "c",
        kind: "adjust",
        entries: [
          { account: account.issuance("c"), delta: -1.5 },
          { account: account.member("m"), delta: 1.5 },
        ],
        idempotencyKey: "k",
      }),
    ).rejects.toThrow(RangeError);
  });

  it("never lets a wallet go negative", async () => {
    const l = ledger();
    await expect(
      l.post({
        cafeId: "c",
        kind: "redeem",
        entries: [
          { account: account.member("m"), delta: -1 },
          { account: account.redemption("c"), delta: 1 },
        ],
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
    expect(await l.balance(account.member("m"))).toBe(0);
  });

  it("lets system accounts go negative (issuance is where peni comes from)", async () => {
    const l = ledger();
    await l.post({
      cafeId: "c",
      kind: "earn",
      entries: [
        { account: account.issuance("c"), delta: -10 },
        { account: account.member("m"), delta: 10 },
      ],
      idempotencyKey: "earn:o1",
    });
    expect(await l.balance(account.issuance("c"))).toBe(-10);
    expect(await l.balance(account.member("m"))).toBe(10);
  });

  it("replays the same idempotency key instead of posting twice", async () => {
    const l = ledger();
    const input = {
      cafeId: "c",
      kind: "earn" as const,
      entries: [
        { account: account.issuance("c"), delta: -10 },
        { account: account.member("m"), delta: 10 },
      ],
      idempotencyKey: "earn:o1",
    };
    const a = await l.post(input);
    const b = await l.post(input);
    expect(b.id).toBe(a.id);
    expect(await l.balance(account.member("m"))).toBe(10);
  });

  it("refuses to reuse an idempotency key for a different operation", async () => {
    const l = ledger();
    const base = { cafeId: "c", kind: "earn" as const, idempotencyKey: "earn:o1" };
    await l.post({ ...base, entries: [{ account: account.issuance("c"), delta: -10 }, { account: account.member("m"), delta: 10 }] });
    await expect(
      l.post({ ...base, entries: [{ account: account.issuance("c"), delta: -99 }, { account: account.member("m"), delta: 99 }] }),
    ).rejects.toBeInstanceOf(PeniError);
  });

  it("serializes concurrent spends so two can't both pass the balance check", async () => {
    const l = ledger();
    await l.post({
      cafeId: "c",
      kind: "earn",
      entries: [{ account: account.issuance("c"), delta: -10 }, { account: account.member("m"), delta: 10 }],
      idempotencyKey: "seed",
    });
    const spend = (key: string) =>
      l.atomically(async () => {
        const balance = await l.balance(account.member("m"));
        if (balance < 10) throw new Error("insufficient");
        await new Promise((r) => setTimeout(r, 5));
        return l.post({
          cafeId: "c",
          kind: "redeem",
          entries: [{ account: account.member("m"), delta: -10 }, { account: account.redemption("c"), delta: 10 }],
          idempotencyKey: key,
        });
      });
    const results = await Promise.allSettled([spend("a"), spend("b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await l.balance(account.member("m"))).toBe(0);
  });
});
