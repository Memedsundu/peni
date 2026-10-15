import { account } from "@peni/core";
import { signShelbyWebhook, verifyShelbyWebhook } from "@peni/core/pos/shelby";
import { beforeEach, describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { DEMO_CUSTOMERS, seed } from "./seed";

let app: PeniApp;
const ayse = () => app.customers.get(DEMO_CUSTOMERS.ayse.id)!;
const deniz = () => app.customers.get(DEMO_CUSTOMERS.deniz.id)!;
const orderInput = (o: Partial<Parameters<PeniApp["createOrder"]>[1]> = {}) => ({
  cafeSlug: "moda",
  lines: [{ productId: "latte", quantity: 1 }],
  usePeni: 0,
  askidaProductId: null,
  idempotencyKey: crypto.randomUUID(),
  ...o,
});

beforeEach(async () => {
  app = new PeniApp({ demo: true, staffKey: "k" });
  await seed(app);
});

describe("ordering", () => {
  it("prices from the menu, not the client, and splits one askı unit out of a larger line", async () => {
    const order = await app.createOrder(deniz(), orderInput({ lines: [{ productId: "cay", quantity: 3 }], askidaProductId: "cay" }));
    expect(order.lines).toEqual([
      expect.objectContaining({ productId: "cay", quantity: 2, fromAskida: false }),
      expect.objectContaining({ productId: "cay", quantity: 1, fromAskida: true }),
    ]);
    expect(order.subtotalKurus).toBe(9_000);
    expect(order.dueKurus).toBe(6_000);
  });

  it("is idempotent per customer", async () => {
    const input = orderInput();
    const a = await app.createOrder(ayse(), input);
    const b = await app.createOrder(ayse(), input);
    expect(b.id).toBe(a.id);
  });

  it("puts the askı item and the peni back if the POS refuses the order", async () => {
    const pool = await app.ledger.balance(account.askida("cafe_moda"));
    const wallet = (await app.wallet(ayse())).totalPeni;
    app.pos.createPendingOrder = async () => {
      throw new Error("POS down");
    };
    await expect(
      app.createOrder(ayse(), orderInput({ lines: [{ productId: "cay", quantity: 1 }, { productId: "latte", quantity: 1 }], askidaProductId: "cay", usePeni: 50 })),
    ).rejects.toThrow("POS down");
    expect(await app.ledger.balance(account.askida("cafe_moda"))).toBe(pool);
    expect((await app.wallet(ayse())).totalPeni).toBe(wallet);
  });

  it("earns only on what was paid at the till", async () => {
    const before = (await app.wallet(ayse())).cafes.find((c) => c.cafeSlug === "moda")!.balancePeni;
    const order = await app.createOrder(ayse(), orderInput({ usePeni: 100 })); // latte 120 TL, 100 peni off
    for (const a of ["accept", "ready", "collect"] as const) await app.staffTransition("moda", order.id, a);
    const after = (await app.wallet(ayse())).cafes.find((c) => c.cafeSlug === "moda")!.balancePeni;
    expect(after).toBe(before - 100 + 1); // 5 % of 20 TL
  });

  it("turns pre-ordering off after two no-shows", async () => {
    for (let i = 0; i < 2; i++) {
      const o = await app.createOrder(ayse(), orderInput());
      for (const a of ["accept", "ready", "no_show"] as const) await app.staffTransition("moda", o.id, a);
    }
    await expect(app.createOrder(ayse(), orderInput())).rejects.toMatchObject({ code: "PREORDER_DISABLED" });
  });
});

describe("Shelby events", () => {
  it("closes the order and pays peni once, even if Shelby sends order.paid twice", async () => {
    const order = await app.createOrder(ayse(), orderInput());
    await app.staffTransition("moda", order.id, "accept");
    const before = (await app.wallet(ayse())).totalPeni;
    const event = { type: "order.paid" as const, posOrderId: `standalone_${order.id}`, peniOrderId: order.id, membershipHint: null, paidTotalKurus: 12_000, paidAt: new Date().toISOString() };
    const raw = JSON.stringify(event);
    const parsed = verifyShelbyWebhook(raw, signShelbyWebhook(raw, "s"), "s")!;
    await app.handlePosEvent(parsed);
    await app.handlePosEvent(parsed);
    expect((await app.wallet(ayse())).totalPeni).toBe(before + 6);
    expect(app.orderFor(ayse(), order.id).status).toBe("collected");
  });
});
