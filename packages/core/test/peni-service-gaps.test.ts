import { describe, expect, it } from "vitest";
import { CAFE, HOUR, setup } from "./helpers";

const DAY = 24 * HOUR;
const cay = { productId: "cay", unitPriceKurus: 3_000 };

describe("askı eligibility (G3)", () => {
  it("is not_member without a membership", async () => {
    const t = setup();
    expect(await t.service.askidaEligibility(null)).toEqual({ status: "not_member" });
    expect(await t.service.askidaEligibility("nobody")).toEqual({ status: "not_member" });
  });

  it("is blocked for a blocked member", async () => {
    const t = setup();
    await t.member("x", { blocked: true });
    expect(await t.service.askidaEligibility("x")).toEqual({ status: "blocked" });
  });

  it("counts the days left for a new member, rounded up", async () => {
    const t = setup({ askidaMinMembershipDays: 7 });
    await t.member("yeni", { joinedAt: new Date(t.now().getTime() - 4 * DAY) });
    expect(await t.service.askidaEligibility("yeni")).toEqual({ status: "too_new", daysLeft: 3 });
    t.advance(2.5 * DAY);
    expect(await t.service.askidaEligibility("yeni")).toEqual({ status: "too_new", daysLeft: 1 });
    t.advance(0.5 * DAY);
    expect(await t.service.askidaEligibility("yeni")).toEqual({ status: "ok" });
  });

  it("says claimed_today after today's ikram, and opens again tomorrow", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 300);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 300, showName: false, idempotencyKey: "d1" });
    expect(await t.service.askidaEligibility("ogrenci")).toEqual({ status: "ok" });
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    expect(await t.service.askidaEligibility("ogrenci")).toEqual({ status: "claimed_today" });
    t.setNow(new Date("2026-10-16T06:00:00Z"));
    expect(await t.service.askidaEligibility("ogrenci")).toEqual({ status: "ok" });
  });

  it("does not count a released claim", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 100);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 100, showName: false, idempotencyKey: "d1" });
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    await t.service.releaseOrder(CAFE, "o1", "rejected");
    expect(await t.service.askidaEligibility("ogrenci")).toEqual({ status: "ok" });
  });
});

describe("earned peni for an order (G7)", () => {
  it("reads the earn transaction of that order", async () => {
    const t = setup({ earnRateBps: 500 });
    await t.member("ayse");
    expect(await t.service.earnedForOrder("o1")).toBeNull();
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 5_500 }); // 55 TL → 2 peni
    expect(await t.service.earnedForOrder("o1")).toBe(2);
    expect(await t.service.earnedForOrder("o2")).toBeNull();
  });

  it("is null when nothing was paid at the till", async () => {
    const t = setup();
    await t.member("ayse");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 0 });
    expect(await t.service.earnedForOrder("o1")).toBeNull();
  });

  it("is net of what a refund took back", async () => {
    const t = setup();
    await t.member("ayse");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 100_000 }); // 50
    await t.service.refundOrder(CAFE, "o1");
    expect(await t.service.earnedForOrder("o1")).toBe(0);
  });
});

describe("member history (G16)", () => {
  it("lists only the member's own wallet movements, newest first, signed", async () => {
    const t = setup({ askidaMatchBps: 5_000, askidaMatchMonthlyCapPeni: 100 });
    await t.member("ayse");
    await t.member("mehmet");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 200_000 }); // +100
    t.advance(1000);
    await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o2",
      lines: [{ productId: "latte", unitPriceKurus: 12_000, quantity: 1 }],
      requestedPeni: 20,
    });
    t.advance(1000);
    await t.service.releaseOrder(CAFE, "o2", "rejected"); // +20 back
    t.advance(1000);
    const out = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    t.advance(1000);
    await t.service.acceptGift(out.id, "mehmet");
    t.advance(1000);
    const back = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 10, idempotencyKey: "g2" });
    t.advance(1000);
    await t.service.declineGift(back.id, "mehmet");
    t.advance(1000);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 30, showName: false, idempotencyKey: "d1" });

    const history = await t.service.memberHistory("ayse");
    expect(history.map((h) => [h.kind, h.peni])).toEqual([
      ["askida_donate", -30],
      ["gift_return", 10],
      ["gift_out", -10],
      ["gift_out", -30],
      ["refund", 20],
      ["redeem", -20],
      ["earn", 100],
    ]);
    expect(history.find((h) => h.kind === "earn")!.orderId).toBe("o1");
    expect(history.find((h) => h.kind === "refund")!.orderId).toBe("o2");
    expect(history[1]!.giftId).toBe(back.id);
    // The café's match goes to the askı, not to Ayşe.
    expect(history.some((h) => h.peni === -15 || h.peni === 15)).toBe(false);

    const mehmet = await t.service.memberHistory("mehmet");
    expect(mehmet.map((h) => [h.kind, h.peni])).toEqual([["gift_in", 30]]);
  });

  it("never shows an askı claim, not even to the taker", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("ogrenci");
    await t.fund("ayse", 100);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 100, showName: false, idempotencyKey: "d1" });
    await t.service.claimFromAskida({ membershipId: "ogrenci", orderId: "o1", ...cay });
    await t.service.earnForPaidOrder({ membershipId: "ogrenci", orderId: "o1", paidTotalKurus: 2_500 }); // 1 peni on the simit
    expect((await t.service.memberHistory("ogrenci")).map((h) => h.kind)).toEqual(["earn"]);
    expect(JSON.stringify(await t.service.memberHistory("ayse"))).not.toContain("ogrenci");
  });

  it("hides an order the POS never took", async () => {
    const t = setup();
    await t.member("ayse");
    await t.fund("ayse", 50);
    await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o1",
      lines: [{ productId: "latte", unitPriceKurus: 12_000, quantity: 1 }],
      requestedPeni: 50,
    });
    await t.service.releaseOrder(CAFE, "o1", "order_failed");
    expect((await t.service.memberHistory("ayse")).map((h) => h.kind)).toEqual(["earn"]);
  });

  it("shows earned peni taken back by a refund as a negative refund line", async () => {
    const t = setup();
    await t.member("ayse");
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 100_000 });
    t.advance(1000);
    await t.service.refundOrder(CAFE, "o1");
    expect((await t.service.memberHistory("ayse")).map((h) => [h.kind, h.peni])).toEqual([
      ["refund", -50],
      ["earn", 50],
    ]);
  });
});

describe("café match percent (G12)", () => {
  it("is the match share while the monthly cap has room, otherwise null", async () => {
    const t = setup({ askidaMatchBps: 5_000, askidaMatchMonthlyCapPeni: 30 });
    await t.member("ayse");
    await t.fund("ayse", 200);
    expect(await t.service.askidaMatchPercent(CAFE)).toBe(50);
    await t.service.donateToAskida({ membershipId: "ayse", peni: 60, showName: false, idempotencyKey: "d1" }); // +30, cap used
    expect(await t.service.askidaMatchPercent(CAFE)).toBeNull();
  });

  it("is null when the café does not match", async () => {
    const t = setup();
    expect(await t.service.askidaMatchPercent(CAFE)).toBeNull();
  });
});

describe("taking a gift back (G17)", () => {
  it("returns the peni to the sender and remembers who took it back", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);
    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    await expect(t.service.cancelGift(gift.id, "mehmet")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const cancelled = await t.service.cancelGift(gift.id, "ayse");
    expect(cancelled.status).toBe("declined");
    expect(await t.service.walletBalance("ayse")).toBe(100);
    expect(await t.service.giftCancelledBySender(gift.id)).toBe(true);
    await expect(t.service.cancelGift(gift.id, "ayse")).rejects.toMatchObject({ code: "GIFT_NOT_PENDING" });
  });

  it("tells a recipient's decline apart from the sender's undo", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);
    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    await t.service.declineGift(gift.id, "mehmet");
    expect(await t.service.giftCancelledBySender(gift.id)).toBe(false);
  });

  it("cannot take back an expired gift; it has already gone home", async () => {
    const t = setup();
    await t.member("ayse");
    await t.member("mehmet");
    await t.fund("ayse", 100);
    const gift = await t.service.sendGift({ fromMembershipId: "ayse", toMembershipId: "mehmet", peni: 30, idempotencyKey: "g1" });
    t.advance(25 * HOUR);
    await expect(t.service.cancelGift(gift.id, "ayse")).rejects.toMatchObject({ code: "GIFT_NOT_PENDING" });
    expect(await t.service.walletBalance("ayse")).toBe(100);
    expect((await t.directory.getGift(gift.id))!.status).toBe("expired");
  });
});

describe("café report windows (G21)", () => {
  it("reports a previous window, with what was still owed at its end", async () => {
    const t = setup();
    await t.member("ayse");
    const start = t.now();
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o1", paidTotalKurus: 100_000 }); // 50, day 0
    t.advance(10 * DAY);
    await t.service.earnForPaidOrder({ membershipId: "ayse", orderId: "o2", paidTotalKurus: 40_000 }); // 20, day 10
    await t.service.redeemForOrder({
      membershipId: "ayse",
      orderId: "o3",
      lines: [{ productId: "latte", unitPriceKurus: 12_000, quantity: 1 }],
      requestedPeni: 30,
    });

    const cut = new Date(start.getTime() + 5 * DAY);
    const previous = await t.service.cafeReport(CAFE, new Date(start.getTime() - DAY), cut);
    expect(previous).toMatchObject({ issuedPeni: 50, redeemedPeni: 0, outstandingPeni: 50 });
    const current = await t.service.cafeReport(CAFE, cut);
    expect(current).toMatchObject({ issuedPeni: 20, redeemedPeni: 30, outstandingPeni: 40 });
  });
});
