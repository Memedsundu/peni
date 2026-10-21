import { describe, expect, it } from "vitest";
import { claimIsOpen, defaultSettings, InMemoryClaimStore, InMemoryDirectory, InMemoryLedgerStore, Ledger, PeniService, randomClaimCode, type PeniClaim } from "../src";

const at = new Date("2026-10-16T09:00:00Z");
const claim = (id: string, code: string, over: Partial<PeniClaim> = {}): PeniClaim => ({
  id, cafeId: "c1", orderId: `o_${id}`, paidKurus: null, staffMemberId: null, businessDay: "2026-10-16", code, token: `t_${id}`, peni: 5,
  createdAt: at, expiresAt: new Date("2026-10-16T21:00:00Z"), claimedAt: null, claimedByMembershipId: null, cancelledAt: null, ...over,
});

describe("peni claims (plan piece 7)", () => {
  it("makes four-digit codes, leading zeros kept", () => {
    expect(randomClaimCode(() => 0)).toBe("0000");
    expect(randomClaimCode(() => 0.0427)).toBe("0427");
    expect(randomClaimCode(() => 0.99999)).toBe("9999");
  });

  it("is open until claimed, cancelled or the day ends", () => {
    expect(claimIsOpen(claim("a", "1"), at)).toBe(true);
    expect(claimIsOpen(claim("a", "1"), new Date("2026-10-16T21:00:00Z"))).toBe(false);
    expect(claimIsOpen(claim("a", "1", { claimedAt: at }), at)).toBe(false);
    expect(claimIsOpen(claim("a", "1", { cancelledAt: at }), at)).toBe(false);
  });

  it("keeps codes unique per café and day", async () => {
    const store = new InMemoryClaimStore();
    expect(await store.saveClaim(claim("a", "0427"))).toBe(true);
    expect(await store.saveClaim(claim("b", "0427"))).toBe(false);
    expect(await store.saveClaim(claim("c", "0427", { businessDay: "2026-10-17" }))).toBe(true);
    expect(await store.saveClaim(claim("d", "0427", { cafeId: "c2" }))).toBe(true);
    expect(await store.saveClaim({ ...claim("a", "0427"), cancelledAt: at })).toBe(true);
    expect([...(await store.codesUsed("c1", "2026-10-16"))]).toEqual(["0427"]);
    expect((await store.getClaimByOrder("c1", "o_a"))!.cancelledAt).toEqual(at);
  });
});

describe("taking a claim (plan piece 10)", () => {
  const CAFE = "c1";
  const setup = async () => {
    let now = at;
    const directory = new InMemoryDirectory();
    directory.settings.set(CAFE, defaultSettings(CAFE));
    const claims = new InMemoryClaimStore();
    const ledger = new Ledger(new InMemoryLedgerStore());
    const service = new PeniService(ledger, directory, () => now, claims);
    for (const id of ["ayse", "can", "other"]) {
      await directory.saveMembership({ id, cafeId: id === "other" ? "c2" : CAFE, customerId: `cust_${id}`, joinedAt: at, blocked: false });
    }
    await claims.saveClaim(claim("a", "0427", { peni: 12 }));
    return { service, claims, setNow: (d: Date) => (now = d) };
  };

  it("credits the claim's peni once, to whoever took it first", async () => {
    const { service, claims } = await setup();
    expect((await service.takeClaim("a", "ayse")).already).toBe(false);
    expect(await service.walletBalance("ayse")).toBe(12);
    // A second tap by Ayşe changes nothing; Can is told it's gone.
    expect((await service.takeClaim("a", "ayse")).already).toBe(true);
    await expect(service.takeClaim("a", "can")).rejects.toMatchObject({ code: "CLAIM_TAKEN" });
    expect(await service.walletBalance("ayse")).toBe(12);
    expect((await claims.getClaim("a"))!.claimedByMembershipId).toBe("ayse");
    expect((await service.memberHistory("ayse"))[0]).toMatchObject({ kind: "earn", peni: 12, orderId: "o_a" });
  });

  it("refuses expired codes, codes of another café, and closes an untaken code on refund", async () => {
    const { service, claims, setNow } = await setup();
    await expect(service.takeClaim("a", "other")).rejects.toMatchObject({ code: "CROSS_CAFE" });
    await service.refundOrder(CAFE, "o_a");
    expect((await claims.getClaim("a"))!.cancelledAt).toEqual(at);
    await expect(service.takeClaim("a", "ayse")).rejects.toMatchObject({ code: "CLAIM_CANCELLED" });

    await claims.saveClaim(claim("b", "1111"));
    setNow(new Date("2026-10-16T21:00:00Z"));
    await expect(service.takeClaim("b", "ayse")).rejects.toMatchObject({ code: "CLAIM_EXPIRED" });
  });

  it("takes taken peni back on refund, as much as is left in the wallet", async () => {
    const { service } = await setup();
    await service.takeClaim("a", "ayse");
    await service.refundOrder(CAFE, "o_a");
    expect(await service.walletBalance("ayse")).toBe(0);
    expect(await service.earnedForOrder("o_a")).toBe(0);
  });

  it("counts wrong codes per customer", async () => {
    const store = new InMemoryClaimStore();
    await store.recordMiss("cust_1", at);
    await store.recordMiss("cust_1", new Date(at.getTime() + 1000));
    await store.recordMiss("cust_2", at);
    expect(await store.countMisses("cust_1", at)).toBe(2);
    expect(await store.countMisses("cust_1", new Date(at.getTime() + 1))).toBe(1);
    expect((await store.getClaimByToken("t_x"))).toBeNull();
  });
});
