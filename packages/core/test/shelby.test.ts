import { describe, expect, it, vi } from "vitest";
import { ShelbyPosAdapter, signShelbyWebhook, verifyShelbyWebhook } from "../src/pos/shelby";

describe("Shelby webhooks", () => {
  const body = JSON.stringify({ type: "order.paid", posOrderId: "s1", peniOrderId: "p1", membershipHint: null, paidTotalKurus: 20000, paidAt: "2026-10-15T09:00:00Z" });

  it("accepts a correctly signed body", () => {
    const header = signShelbyWebhook(body, "secret", 1_000);
    expect(verifyShelbyWebhook(body, header, "secret", 1_010)).toMatchObject({ type: "order.paid", posOrderId: "s1" });
  });

  it("rejects a tampered body, a wrong secret and a stale timestamp", () => {
    const header = signShelbyWebhook(body, "secret", 1_000);
    expect(verifyShelbyWebhook(body.replace("20000", "90000"), header, "secret", 1_000)).toBeNull();
    expect(verifyShelbyWebhook(body, header, "other", 1_000)).toBeNull();
    expect(verifyShelbyWebhook(body, header, "secret", 2_000)).toBeNull();
    expect(verifyShelbyWebhook(body, null, "secret", 1_000)).toBeNull();
  });
});

describe("ShelbyPosAdapter", () => {
  it("calls the partner API with the mapped café id and the service token", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ acceptingOrders: true }), { status: 200 }));
    const adapter = new ShelbyPosAdapter({
      baseUrl: "https://shelby.example/",
      token: "tok",
      cafeIdMap: { peni_cafe: "shelby_cafe_1" },
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    expect(await adapter.isAcceptingOrders("peni_cafe")).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://shelby.example/api/partner/peni/v1/cafes/shelby_cafe_1/status");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("refuses cafés that are not linked", async () => {
    const adapter = new ShelbyPosAdapter({ baseUrl: "https://x", token: "t", cafeIdMap: {} });
    await expect(adapter.listMenu("nope")).rejects.toThrow(/not linked/);
  });
});
