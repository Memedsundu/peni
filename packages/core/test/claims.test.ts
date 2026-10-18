import { describe, expect, it } from "vitest";
import { claimIsOpen, InMemoryClaimStore, randomClaimCode, type PeniClaim } from "../src";

const at = new Date("2026-10-16T09:00:00Z");
const claim = (id: string, code: string, over: Partial<PeniClaim> = {}): PeniClaim => ({
  id, cafeId: "c1", orderId: `o_${id}`, businessDay: "2026-10-16", code, token: `t_${id}`, peni: 5,
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
