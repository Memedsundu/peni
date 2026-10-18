import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let ece: StaffContext;
let leyla: StaffContext;
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
const pool = () => app.peni.askidaBalance("cafe_moda");
/** Moda: çay ₺30, latte ₺120. */
const order = (lines: { productId: string; quantity: number }[]) => app.till.create(ece, { createKey: key(), lines });

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  const signIn = async (who: keyof typeof DEMO_STAFF) => app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, "moda");
  ece = await signIn("ece");
  leyla = await signIn("leyla");
  await app.cash.open(ece, { key: "open-the-drawer", countKurus: 50_000 });
});

describe("askıda kahve at the till (plan piece 13)", () => {
  it("gives a tea from the askı to anyone who asks, and the rest is paid as usual", async () => {
    const before = await pool();
    const askida = await app.till.tillAskida(ece);
    expect(askida.balancePeni).toBe(before);
    expect(askida.items.map((i) => i.productId)).toEqual(["simit", "cay", "filtre"]);
    expect(askida.items.find((i) => i.productId === "cay")).toMatchObject({ peni: 30, available: Math.floor(before / 30) });

    const o = await order([{ productId: "cay", quantity: 1 }, { productId: "latte", quantity: 1 }]);
    const pay = { productId: "cay", quantity: 1, payKey: "askida-1" };
    const given = await app.till.giveAskida(ece, o.id, pay);
    expect(given.payment).toMatchObject({ method: "askida", status: "approved", amountKurus: 3_000, reference: "1xcay" });
    expect(given.order).toMatchObject({ status: "open", dueKurus: 12_000, askida: { kurus: 3_000, items: [{ name: "Çay", quantity: 1 }] } });
    // A retried tap pays once.
    expect((await app.till.giveAskida(ece, o.id, pay)).payment.id).toBe(given.payment.id);
    expect(await pool()).toBe(before - 30);

    expect(await code(app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 1, payKey: key() }))).toBe("ASKIDA_NOT_ON_ORDER");
    expect(await code(app.till.giveAskida(ece, o.id, { productId: "latte", quantity: 1, payKey: key() }))).toBe("PRODUCT_NOT_ELIGIBLE");
    expect(await code(app.till.update(ece, o.id, { lines: [{ productId: "cay", quantity: 1 }] }))).toBe("ASKIDA_ON_ORDER");

    const paid = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    await app.till.confirmPayment(ece, o.id, paid.payment.id);
    const done = await app.till.get(ece, o.id);
    expect(done).toMatchObject({ status: "paid", paymentMethod: "card", askida: { kurus: 3_000 } });
    // Only the latte earns peni: 5% of ₺120.
    const claim = await app.till.confirmPayment(ece, o.id, paid.payment.id);
    expect(claim.order.claim?.peni).toBe(6);
    expect((await app.till.list(leyla)).summary).toMatchObject({ askidaKurus: 3_000, cardKurus: 12_000 });
  });

  it("can pay a whole order of askı items, and only askı items", async () => {
    const o = await order([{ productId: "cay", quantity: 2 }]);
    expect(await code(app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 3, payKey: key() }))).toBe("ASKIDA_NOT_ON_ORDER");
    const given = await app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 2, payKey: key() });
    expect(given.order).toMatchObject({ status: "paid", paymentMethod: "askida", claim: null });

    await app.directory.saveSettings({ ...(await app.directory.getSettings("cafe_moda")), askidaProductIds: ["simit"] });
    const tea = await order([{ productId: "cay", quantity: 1 }]);
    expect(await code(app.till.giveAskida(ece, tea.id, { productId: "cay", quantity: 1, payKey: key() }))).toBe("PRODUCT_NOT_ELIGIBLE");
  });

  it("says so when the askı can't pay", async () => {
    const teas = Math.floor((await pool()) / 30) + 1;
    const o = await order([{ productId: "cay", quantity: teas }]);
    let left = teas;
    let last: string | undefined = "ok";
    while (left > 0 && last === "ok") {
      const n = Math.min(20, left);
      last = await code(app.till.giveAskida(ece, o.id, { productId: "cay", quantity: n, payKey: key() }));
      if (last === "ok") left -= n;
    }
    // The last batch didn't fit; one at a time, all but one tea does.
    while (left > 1) {
      expect(await code(app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 1, payKey: key() }))).toBe("ok");
      left--;
    }
    expect(await code(app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 1, payKey: key() }))).toBe("ASKIDA_EMPTY");
    expect(await pool()).toBeLessThan(30);
  });

  it("puts askı items back when the barista takes them off, voids the order, or refunds it", async () => {
    const before = await pool();
    const o = await order([{ productId: "cay", quantity: 1 }, { productId: "latte", quantity: 1 }]);
    await app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 1, payKey: key() });
    const back = await app.till.returnAskida(ece, o.id);
    expect(back).toMatchObject({ askida: null, dueKurus: 15_000 });
    expect(await pool()).toBe(before);
    // Given again after going back: a fresh key, a fresh payment.
    await app.till.giveAskida(ece, o.id, { productId: "cay", quantity: 1, payKey: key() });
    expect(await pool()).toBe(before - 30);
    expect((await app.till.void(leyla, o.id, { reason: "Müşteri vazgeçti" })).status).toBe("voided");
    expect(await pool()).toBe(before);

    const paid = await order([{ productId: "cay", quantity: 1 }, { productId: "latte", quantity: 1 }]);
    await app.till.giveAskida(ece, paid.id, { productId: "cay", quantity: 1, payKey: key() });
    await app.till.pay(ece, paid.id, { method: "cash", payKey: key() });
    const refunded = await app.till.refund(leyla, paid.id, { reason: "Yanlış sipariş" });
    expect(refunded).toMatchObject({ status: "refunded", refunded: { amountKurus: 15_000 } });
    expect(refunded.payments.filter((p) => p.kind === "refund").map((p) => [p.method, p.amountKurus])).toEqual([
      ["askida", 3_000],
      ["cash", 12_000],
    ]);
    expect(await pool()).toBe(before);
  });

  it("leaves a tea on the askı when a guest pays for one, and takes it back off on a refund", async () => {
    const before = await pool();
    const o = await order([{ productId: "askida:cay", quantity: 2 }, { productId: "latte", quantity: 1 }]);
    expect(o.lines[0]).toMatchObject({ productId: "askida:cay", name: "Askıya çay", unitPriceKurus: 3_000, hang: true });
    expect(o.totalKurus).toBe(18_000);
    expect(await code(order([{ productId: "askida:latte", quantity: 1 }]))).toBe("PRODUCT_NOT_ELIGIBLE");
    expect(await pool()).toBe(before);

    const paid = await app.till.pay(ece, o.id, { method: "cash", payKey: key() });
    expect(paid.order.status).toBe("paid");
    expect(await pool()).toBe(before + 60);
    // Catching up on the same payment doesn't hang them twice.
    await app.till.payment(ece, o.id, paid.payment.id);
    expect(await pool()).toBe(before + 60);
    const wall = await app.peni.askidaWall("cafe_moda", 1);
    expect(wall[0]).toMatchObject({ type: "till_donation", peni: 60 });

    await app.till.refund(leyla, o.id, { reason: "Yanlış girildi" });
    expect(await pool()).toBe(before);
  });
});
