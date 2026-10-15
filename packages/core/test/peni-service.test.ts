import { describe, expect, it } from "vitest";
import { account } from "../src";
import { CAFE, HOUR, setup } from "./helpers";

describe("earning", () => {
  it("returns the café's rate as whole peni, rounded down", async () => {
    const t = setup({ earnRateBps: 500 });
    await t.member("ayse");
    // 237,50 TL × 5 % = 11,875 TL → 11 peni
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 23_750 });
    expect(await t.service.walletBalance("ayse")).toBe(11);
  });

  it("does not pay twice when the till webhook is delivered twice", async () => {
    const t = setup();
    await t.member("ayse");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 20_000 });
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 20_000 });
    expect(await t.service.walletBalance("ayse")).toBe(10);
  });

  it("gives blocked members nothing", async () => {
    const t = setup();
    await t.member("x", { blocked: true });
    expect(await t.service.earnForPaidOrder({ membershipId: "x", orderId: "o1", paidTotalKurus: 20_000 })).toBeNull();
  });
});

describe("spending peni on an order", () => {
  it("is capped by balance, eligible products and the café's max share", async () => {
    const t = setup({ maxRedeemShareBps: 5_000, redeemableProductIds: ["latte"] });
    await t.member("ayse");
    await t.fund("ayse", 500);
    const plan = await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o2",
      lines: [
        { productId: "latte", unitPriceKurus: 12_000, quantity: 1 },
        { productId: "kek", unitPriceKurus: 8_000, quantity: 1 },
      ],
      requestedPeni: 500,
    });
    // Order 200 TL, 50 % cap = 100 TL, latte alone is 120 TL → 100 peni.
    expect(plan.appliedPeni).toBe(100);
    expect(plan.discountKurus).toBe(10_000);
    expect(await t.service.walletBalance("ayse")).toBe(400);
  });

  it("gives the peni back when the order is rejected", async () => {
    const t = setup();
    await t.member("ayse");
    await t.fund("ayse", 50);
    await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o3",
      lines: [{ productId: "latte", unitPriceKurus: 12_000, quantity: 1 }],
      requestedPeni: 50,
    });
    expect(await t.service.walletBalance("ayse")).toBe(0);
    await t.service.releaseOrder(CAFE, "o3", "rejected");
    expect(await t.service.walletBalance("ayse")).toBe(50);
  });
});

describe("gifts (ısmarlama)", () => {
  it("holds the peni in escrow until the friend accepts", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);

    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 60, idempotencyKey: "g1" });
    expect(await t.service.walletBalance("ayse")).toBe(40);
    expect(await t.service.walletBalance("mehmet")).toBe(0);
    expect(await t.ledger.balance(account.giftEscrow(CAFE))).toBe(60);

    await t.service.acceptGift(gift.id, "mehmet");
    expect(await t.service.walletBalance("mehmet")).toBe(60);
    expect(await t.ledger.balance(account.giftEscrow(CAFE))).toBe(0);
  });

  it("returns the gift to the sender after 24 hours", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);
    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 60, idempotencyKey: "g1" });

    t.advance(25 * HOUR);
    const expired = await t.service.expireGifts();
    expect(expired.map((g) => g.id)).toEqual([gift.id]);
    expect(await t.service.walletBalance("ayse")).toBe(100);
    await expect(t.service.acceptGift(gift.id, "mehmet")).rejects.toMatchObject({ code: "GIFT_NOT_PENDING" });
  });

  it("enforces the daily limit", async () => {
    const t = setup({ dailyGiftLimitPeni: 100 });
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 500);
    await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 80, idempotencyKey: "g1" });
    await expect(
      t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g2" }),
    ).rejects.toMatchObject({ code: "GIFT_LIMIT" });
  });

  it("treats a retried send as the same gift", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);
    const a = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    const b = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    expect(b.id).toBe(a.id);
    expect(await t.service.walletBalance("ayse")).toBe(70);
  });

  it("does not cross cafés", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("elsewhere", { cafeId: "cafe_other" });
    await t.fund("ayse", 100);
    await expect(
      t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "elsewhere", peni: 10, idempotencyKey: "g" }),
    ).rejects.toMatchObject({ code: "CROSS_CAFE" });
  });
});

describe("askıda kahve", () => {
  const cay = { productId: "cay", unitPriceKurus: 3_000 };

  it("lets one member's peni pay for a stranger's tea", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 100);

    await t.service.donateToAskida({ membershipId: "ayse", peni: 90, showName: false, idempotencyKey: "d1" });
    expect(await t.service.walletBalance("ayse")).toBe(10);

    const claim = await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    expect(claim.peni).toBe(30);
    expect(claim.discountKurus).toBe(3_000);
    expect(await t.service.walletBalance("ogrenci")).toBe(0); // own wallet untouched
    expect(await t.ledger.balance(account.askida(CAFE))).toBe(60);
  });

  it("limits claims per day and resets the next local day", async () => {
    const t = setup({ askidaClaimsPerDay: 1 });
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 300);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 300, showName: false, idempotencyKey: "d1" });

    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    await expect(t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o2", ...cay })).rejects.toMatchObject({
      code: "ASKIDA_LIMIT",
    });

    t.setNow(new Date("2026-10-16T06:00:00Z")); // 09:00 next day in Istanbul
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o3", ...cay });
  });

  it("does not count a claim whose order was rejected", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 300);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 300, showName: false, idempotencyKey: "d1" });
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    await t.service.releaseOrder(CAFE, "o1", "rejected");
    expect(await t.ledger.balance(account.askida(CAFE))).toBe(300);
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o2", ...cay });
  });

  it("only gives out the products the café put on the askı", async () => {
    const t = setup();
    await t.member("ogrenci");
    await expect(
      t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", productId: "cheesecake", unitPriceKurus: 18_000 }),
    ).rejects.toMatchObject({ code: "PRODUCT_NOT_ELIGIBLE" });
  });

  it("says so when the askı is empty", async () => {
    const t = setup();
    await t.member("ogrenci");
    await expect(t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay })).rejects.toMatchObject({
      code: "ASKIDA_EMPTY",
    });
  });

  it("can require a minimum membership age", async () => {
    const t = setup({ askidaMinMembershipDays: 7 });
    await t.member("ayse");
    await t.member("yeni", { joinedAt: new Date("2026-10-14T00:00:00Z") });
    await t.fund("ayse", 100);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 100, showName: false, idempotencyKey: "d1" });
    await expect(t.service.claimFromAskida({ membershipId: "yeni", orderId: "o1", ...cay })).rejects.toMatchObject({
      code: "ASKIDA_TOO_NEW",
    });
  });

  it("matches donations up to the café's monthly cap", async () => {
    const t = setup({ askidaMatchBps: 5_000, askidaMatchMonthlyCapPeni: 40 });
    await t.member("ayse");
    await t.fund("ayse", 200);
    const first = await t.service.donateToAskida({ membershipId: "ayse", peni: 60, showName: true, idempotencyKey: "d1" });
    const second = await t.service.donateToAskida({ membershipId: "ayse", peni: 60, showName: true, idempotencyKey: "d2" });
    expect(first.matchedPeni).toBe(30);
    expect(second.matchedPeni).toBe(10);
    expect(await t.ledger.balance(account.askida(CAFE))).toBe(160);
  });

  it("records cash paid at the till into the pool", async () => {
    const t = setup();
    await t.service.recordTillDonation({ cafeId: CAFE, peni: 90, staffUserId: "barista_1", idempotencyKey: "till1" });
    expect(await t.ledger.balance(account.askida(CAFE))).toBe(90);
  });

  it("names donors only if they chose to, and never names takers", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("can");
    await t.member("ogrenci");
    await t.fund("ayse", 100);
    await t.fund("can", 100);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 30, showName: true, idempotencyKey: "d1" });
    t.advance(1000);
    await t.service.donateToAskida({ membershipId: "can", peni: 30, showName: false, idempotencyKey: "d2" });
    t.advance(1000);
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });

    const wall = await t.service.askidaWall(CAFE);
    expect(wall.map((e) => e.type)).toEqual(["claim", "donation", "donation"]);
    expect(wall[1]).toMatchObject({ donorMembershipId: null });
    expect(wall[2]).toMatchObject({ donorMembershipId: "ayse" });
    expect(JSON.stringify(wall)).not.toContain("ogrenci");
  });

  it("shows how many teas are waiting", async () => {
    const t = setup();
    await t.member("ayse");
    await t.fund("ayse", 100);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 100, showName: false, idempotencyKey: "d1" });
    const snap = await t.service.askidaSnapshot(CAFE, 3_000);
    expect(snap.itemsAvailable).toBe(3);
    expect(snap.donatedLast7DaysPeni).toBe(100);
  });
});

describe("refunds", () => {
  it("takes back earned peni only as far as the wallet allows", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 100_000 }); // 50 peni
    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 40, idempotencyKey: "g" });
    await t.service.acceptGift(gift.id, "mehmet");

    const [reversal] = await t.service.refundOrder(CAFE, "o1");
    expect(reversal!.meta.shortfallPeni).toBe(40);
    expect(await t.service.walletBalance("ayse")).toBe(0);
  });
});

describe("café report", () => {
  it("adds up to what is still owed", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 200);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 60, showName: false, idempotencyKey: "d1" });
    await t.service.recordTillDonation({ cafeId: CAFE, peni: 30, staffUserId: "b", idempotencyKey: "t1" });
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", productId: "cay", unitPriceKurus: 3_000 });
    await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o2",
      lines: [{ productId: "latte", unitPriceKurus: 12_000, quantity: 1 }],
      requestedPeni: 100,
    });

    const r = await t.service.cafeReport(CAFE, new Date("2026-10-01T00:00:00Z"));
    expect(r.issuedPeni).toBe(200);
    expect(r.askidaDonatedByMembersPeni).toBe(60);
    expect(r.askidaTillDonationsPeni).toBe(30);
    expect(r.askidaClaimedPeni).toBe(30);
    expect(r.redeemedPeni).toBe(100);
    // 200 issued + 30 cash − 30 claimed − 100 redeemed = 100 still out there (40 wallet + 60 askı)
    expect(r.outstandingPeni).toBe(100);
  });
});

describe("no-shows", () => {
  it("switches pre-ordering off after two in a row, and a pickup resets the count", async () => {
    const t = setup({ noShowStrikeLimit: 2 });
    await t.member("ayse");
    expect((await t.service.recordPickupOutcome("ayse", "no_show")).preorderEnabled).toBe(true);
    await t.service.recordPickupOutcome("ayse", "collected");
    expect((await t.service.recordPickupOutcome("ayse", "no_show")).preorderEnabled).toBe(true);
    expect((await t.service.recordPickupOutcome("ayse", "no_show")).preorderEnabled).toBe(false);
  });
});
