import { describe, expect, it } from "vitest";
import { defaultSettings, normalizeSpendCode, randomSpendCode, tillSpendCap } from "../src";
import { CAFE, setup } from "./helpers";

describe("spending peni at the till (plan piece 11)", () => {
  it("makes six-digit codes and reads what a scanner or a barista typed", () => {
    expect(randomSpendCode(() => 0.042731)).toBe("042731");
    expect(normalizeSpendCode(" 042 731 ")).toBe("042731");
    expect(normalizeSpendCode("42731")).toBeNull();
    expect(normalizeSpendCode("M7K-42Q")).toBeNull();
  });

  it("caps peni by what's left to pay, the café's share and its products, in whole peni", () => {
    const settings = defaultSettings(CAFE);
    const lines = [{ productId: "latte", totalKurus: 12_000 }, { productId: "simit", totalKurus: 2_550 }];
    const cap = (over: Partial<Parameters<typeof tillSpendCap>[0]>) =>
      tillSpendCap({ lines, orderTotalKurus: 14_550, dueKurus: 14_550, peniOnOrder: 0, settings, ...over });
    expect(cap({})).toBe(145); // ₺145,50: the 50 kuruş go on cash or card
    expect(cap({ peniOnOrder: 45, dueKurus: 10_050 })).toBe(100);
    expect(cap({ settings: { ...settings, maxRedeemShareBps: 5_000 } })).toBe(72);
    expect(cap({ settings: { ...settings, redeemableProductIds: ["simit"] } })).toBe(25);
    // A 10% order discount shrinks the simit's share too.
    expect(cap({ orderTotalKurus: 13_095, dueKurus: 13_095, settings: { ...settings, redeemableProductIds: ["simit"] } })).toBe(22);
    expect(cap({ settings: { ...settings, peniEnabled: false } })).toBe(0);
  });

  it("opens a wallet only with a live code of this café, and takes peni once per key", async () => {
    const { service, member, fund, advance } = setup();
    await member("ayse");
    await fund("ayse", 50);
    const code = await service.issueSpendCode("ayse", () => 0.5);
    expect(code.code).toBe("500000");
    expect((await service.spenderForCode(CAFE, "500 000")).id).toBe("ayse");
    await expect(service.spenderForCode("other_cafe", "500000")).rejects.toMatchObject({ code: "SPEND_CODE_WRONG" });

    const spend = { membershipId: "ayse", orderId: "o1", key: "k1", requestedPeni: 80, capPeni: 30 };
    expect(await service.spendAtTill(spend)).toBe(30);
    expect(await service.spendAtTill(spend)).toBe(30);
    expect(await service.walletBalance("ayse")).toBe(20);
    expect(await service.spendAtTill({ ...spend, key: "k2", capPeni: 100 })).toBe(20);
    await expect(service.spendAtTill({ ...spend, key: "k3" })).rejects.toMatchObject({ code: "NOTHING_TO_SPEND" });
    // Voiding gives every spend on the order back.
    await service.releaseOrder(CAFE, "o1", "void");
    expect(await service.walletBalance("ayse")).toBe(50);

    advance(5 * 60_000);
    await expect(service.spenderForCode(CAFE, "500000")).rejects.toMatchObject({ code: "SPEND_CODE_EXPIRED" });
    // A new code replaces the old one.
    await service.issueSpendCode("ayse", () => 0.123456);
    await expect(service.spenderForCode(CAFE, "500000")).rejects.toMatchObject({ code: "SPEND_CODE_WRONG" });
  });
});
