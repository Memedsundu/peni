import { beforeEach, describe, expect, it } from "vitest";
import { PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const order = (ctx: StaffContext, lines: { productId: string; quantity: number; discountPercent?: number }[], discountPercent?: number) =>
  app.till.create(ctx, { createKey: key(), lines, discountPercent });

/** Ece at the till computer, signed in with her PIN. */
async function eceAtTill(): Promise<StaffContext> {
  const device = (await app.staff.registerDevice(leyla, "Kasa")).token;
  const memberId = (await app.staff.till(device)).staff.find((s) => s.name === "Ece Tan")!.memberId;
  return app.staff.at((await app.staff.pinSignIn(device, memberId, DEMO_STAFF.ece.pin)).token, "moda");
}

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now });
  await seed(app);
  leyla = await at("leyla");
  ece = await eceAtTill();
});

describe("the till's orders (plan piece 6)", () => {
  it("shows the till only what can be sold, by tab", async () => {
    await app.menuEditor.updateProduct(leyla, "limonata", { available: false });
    const menu = await app.till.tillMenu(ece);
    expect(menu.categories.map((c) => c.name)).toEqual(["Sıcak", "Yiyecek", "Tatlı"]);
    expect(menu.categories[0]!.products[0]).toEqual({ productId: "cay", name: "Çay", priceKurus: 3_000, imageUrl: null });
  });

  it("prices an order on the server, line discounts first, then the order discount", async () => {
    const o = await order(ece, [
      { productId: "latte", quantity: 2, discountPercent: 10 },
      { productId: "cay", quantity: 1 },
    ], 5);
    expect(o).toMatchObject({ number: 1, businessDay: "2026-10-16", status: "open", itemCount: 3, takenBy: "Ece Tan" });
    expect(o.lines.map((l) => [l.name, l.unitPriceKurus, l.totalKurus])).toEqual([
      ["Latte", 12_000, 21_600],
      ["Çay", 3_000, 3_000],
    ]);
    // 24.600 after line discounts, 5% off is 1.230.
    expect(o).toMatchObject({ subtotalKurus: 27_000, discountKurus: 3_630, totalKurus: 23_370 });
  });

  it("makes one order however often the till retries, and numbers restart each local day", async () => {
    const input = { createKey: "same-tap-123", lines: [{ productId: "cay", quantity: 1 }] };
    const first = await app.till.create(ece, input);
    expect((await app.till.create(ece, input)).id).toBe(first.id);
    expect((await order(ece, [{ productId: "simit", quantity: 1 }])).number).toBe(2);
    now = new Date("2026-10-16T21:30:00Z"); // 00:30 in Istanbul
    expect(await order(ece, [{ productId: "simit", quantity: 1 }])).toMatchObject({ number: 1, businessDay: "2026-10-17" });
  });

  it("refuses what the menu doesn't sell and checks quantities and discounts", async () => {
    await app.menuEditor.updateProduct(leyla, "latte", { removed: true });
    expect(await code(order(ece, [{ productId: "latte", quantity: 1 }]))).toBe("PRODUCT_UNAVAILABLE");
    expect(await code(order(ece, [{ productId: "sahlep", quantity: 1 }]))).toBe("PRODUCT_UNAVAILABLE"); // Kuzguncuk's
    expect(await code(order(ece, []))).toBe("ORDER_EMPTY");
    expect(await code(order(ece, [{ productId: "cay", quantity: 60 }, { productId: "cay", quantity: 60 }]))).toBe("QUANTITY_INVALID");
    expect(await code(order(ece, [{ productId: "cay", quantity: 1 }], 101))).toBe("DISCOUNT_INVALID");
  });

  it("changes an open order and takes cash with change, once", async () => {
    let o = await order(ece, [{ productId: "cay", quantity: 1 }]);
    o = await app.till.update(ece, o.id, { lines: [{ productId: "cay", quantity: 2 }, { productId: "simit", quantity: 1 }] });
    expect(o.totalKurus).toBe(8_500);
    expect(await code(app.till.pay(ece, o.id, { method: "cash", payKey: key(), tenderedKurus: 5_000 }))).toBe("TENDERED_TOO_LOW");
    const payKey = key();
    const paid = await app.till.pay(ece, o.id, { method: "cash", payKey, tenderedKurus: 10_000 });
    expect(paid).toMatchObject({ status: "paid", paymentMethod: "cash", tenderedKurus: 10_000, changeKurus: 1_500 });
    expect((await app.till.pay(ece, o.id, { method: "cash", payKey, tenderedKurus: 10_000 })).paidAt).toBe(paid.paidAt);
    expect(await code(app.till.pay(ece, o.id, { method: "card", payKey: key() }))).toBe("ORDER_NOT_OPEN");
    expect(await code(app.till.update(ece, o.id, { lines: [{ productId: "cay", quantity: 1 }] }))).toBe("ORDER_NOT_OPEN");
  });

  it("lets a manager void an unpaid order and refund a paid one, with a reason; not a barista", async () => {
    const murat = await at("murat");
    const open = await order(ece, [{ productId: "latte", quantity: 1 }]);
    const paid = await order(ece, [{ productId: "turk", quantity: 1 }]);
    await app.till.pay(ece, paid.id, { method: "card", payKey: key() });
    expect(open.canVoid).toBe(false);
    expect(await code(app.till.void(ece, open.id, { reason: "Müşteri vazgeçti" }))).toBe("FORBIDDEN");
    expect(await code(app.till.void(murat, open.id, { reason: "  " }))).toBe("REASON_REQUIRED");
    expect(await code(app.till.void(murat, paid.id, { reason: "Yanlış" }))).toBe("ORDER_NOT_OPEN");
    expect((await app.till.void(murat, open.id, { reason: "Müşteri vazgeçti" })).voided).toMatchObject({ by: "Murat Aksu", reason: "Müşteri vazgeçti" });
    expect(await code(app.till.refund(murat, open.id, { reason: "x" }))).toBe("ORDER_NOT_PAID");
    const refunded = await app.till.refund(murat, paid.id, { reason: "Soğuk geldi" });
    expect(refunded).toMatchObject({ status: "refunded", refunded: { by: "Murat Aksu", amountKurus: 9_000 } });
  });

  it("sums the day for Satışlar and hides deleted orders", async () => {
    const a = await order(ece, [{ productId: "latte", quantity: 1 }]);
    const b = await order(ece, [{ productId: "cay", quantity: 2 }]);
    const c = await order(ece, [{ productId: "simit", quantity: 1 }]);
    await order(ece, [{ productId: "turk", quantity: 1 }]);
    await app.till.pay(ece, a.id, { method: "card", payKey: key() });
    await app.till.pay(ece, b.id, { method: "cash", payKey: key() });
    await app.till.pay(ece, c.id, { method: "cash", payKey: key() });
    await app.till.refund(leyla, c.id, { reason: "Bayattı" });
    const day = await app.till.list(ece);
    expect(day.orders.map((o) => o.number)).toEqual([4, 3, 2, 1]);
    expect(day.summary).toEqual({
      paidCount: 2,
      salesKurus: 18_000,
      cashKurus: 6_000,
      cardKurus: 12_000,
      refundedCount: 1,
      refundedKurus: 2_500,
      voidedCount: 0,
      openCount: 1,
    });
    expect((await app.till.list(ece, { status: "refunded" })).orders.map((o) => o.number)).toEqual([3]);
    // "Sil" is for the owner, signed in with a password, and keeps the order on record.
    expect(await code(app.till.remove(ece, a.id, { reason: "Deneme" }))).toBe("FORBIDDEN");
    expect(await code(app.till.remove(await at("murat"), a.id, { reason: "Deneme" }))).toBe("FORBIDDEN");
    await app.till.remove(leyla, a.id, { reason: "Deneme" });
    expect((await app.till.list(leyla)).orders.map((o) => o.number)).toEqual([4, 3, 2]);
    expect(await code(app.till.get(leyla, a.id))).toBe("ORDER_NOT_FOUND");
    expect(await code(app.till.list(ece, { businessDay: "2026-10-15" }))).toBe("ok");
  });

  it("keeps each café's orders apart", async () => {
    const o = await order(ece, [{ productId: "cay", quantity: 1 }]);
    const tarik = await at("tarik", "kuzguncuk");
    expect(await code(app.till.get(tarik, o.id))).toBe("ORDER_NOT_FOUND");
    expect((await app.till.list(tarik)).orders).toEqual([]);
  });

  it("asks the owner for a password sign-in to delete when signed in at the till with a PIN", async () => {
    await app.staff.setPin(leyla, "4826");
    const device = (await app.staff.registerDevice(leyla, "Kasa 2")).token;
    const leylaId = (await app.staff.till(device)).staff.find((s) => s.name === "Leyla Kara")!.memberId;
    const atTill = await app.staff.at((await app.staff.pinSignIn(device, leylaId, "4826")).token, "moda");
    const o = await order(atTill, [{ productId: "cay", quantity: 1 }]);
    expect(o.canDelete).toBe(false);
    expect(await code(app.till.remove(atTill, o.id, { reason: "Deneme" }))).toBe("NEEDS_PASSWORD");
  });
});
