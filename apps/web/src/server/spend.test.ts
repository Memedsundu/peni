import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let ece: StaffContext;
let leyla: StaffContext;
let ayse: CustomerRecord;
let mehmet: CustomerRecord;
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
const balance = async (c: CustomerRecord) => (await app.wallet(c)).cafes.find((x) => x.cafeSlug === "moda")!.balancePeni;
/** 2 latte and a simit: ₺265. */
const order = () => app.till.create(ece, { createKey: key(), lines: [{ productId: "latte", quantity: 2 }, { productId: "simit", quantity: 1 }] });
const spendCode = async (c: CustomerRecord) => (await app.spendCode(c, "moda")).code;

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  const signIn = async (who: keyof typeof DEMO_STAFF) => app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, "moda");
  ece = await signIn("ece");
  leyla = await signIn("leyla");
  await app.cash.open(ece, { key: "open-the-drawer", countKurus: 50_000 });
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
  mehmet = (await app.identity.getCustomer("cus_mehmet"))!;
});

describe("spending pennies at the till (plan piece 11)", () => {
  it("opens the wallet with a live ödeme kodu and pays part of the order with penny, the rest in cash", async () => {
    const before = await balance(ayse);
    expect(before).toBeGreaterThan(40);
    const o = await order();
    const c = await spendCode(ayse);
    expect(c).toMatch(/^\d{6}$/);
    const check = await app.till.checkPeni(ece, o.id, { code: c });
    expect(check).toMatchObject({ name: "Ayşe Y.", balancePeni: before, maxPeni: Math.min(before, 265) });

    const used = await app.till.usePeni(ece, o.id, { code: c, peni: 40, payKey: "peni-1" });
    expect(used.payment).toMatchObject({ method: "peni", status: "approved", amountKurus: 4_000 });
    expect(used.order).toMatchObject({ status: "open", dueKurus: 22_500, peni: { peni: 40, name: "Ayşe Y." }, claim: null });
    // A retried tap takes them once.
    expect((await app.till.usePeni(ece, o.id, { code: c, peni: 40, payKey: "peni-1" })).payment.id).toBe(used.payment.id);
    expect(await balance(ayse)).toBe(before - 40);

    const paid = await app.till.pay(ece, o.id, { method: "cash", payKey: key(), tenderedKurus: 25_000 });
    expect(paid.order).toMatchObject({ status: "paid", changeKurus: 2_500, paymentMethod: "cash" });
    // Only the ₺225 paid in money earns: 11 peni at 5%.
    expect(paid.order.claim!.peni).toBe(11);
    const day = await app.till.list(leyla);
    expect(day.summary).toMatchObject({ cashKurus: 22_500, peniKurus: 4_000 });
    expect((await app.cash.state(ece)).open!.totals.cashSalesKurus).toBe(22_500);
  });

  it("pays a whole order with pennies, and refunds the pennies back to the wallet", async () => {
    const o = await app.till.create(ece, { createKey: key(), lines: [{ productId: "cay", quantity: 1 }] });
    const before = await balance(ayse);
    const paid = await app.till.usePeni(ece, o.id, { code: await spendCode(ayse), peni: 99, payKey: key() });
    expect(paid.order).toMatchObject({ status: "paid", paymentMethod: "peni", claim: null, peni: { peni: 30 } });
    expect(await balance(ayse)).toBe(before - 30);
    const refunded = await app.till.refund(leyla, o.id, { reason: "Soğudu" });
    expect(refunded).toMatchObject({ status: "refunded", peni: null, refunded: { amountKurus: 3_000 } });
    expect(await balance(ayse)).toBe(before);
  });

  it("refunds a split order both ways: pennies to the wallet, cash from the drawer", async () => {
    const before = await balance(ayse);
    const o = await order();
    await app.till.usePeni(ece, o.id, { code: await spendCode(ayse), peni: 65, payKey: key() });
    await app.till.pay(ece, o.id, { method: "cash", payKey: key() });
    const refunded = await app.till.refund(leyla, o.id, { reason: "Yanlış sipariş" });
    expect(refunded.status).toBe("refunded");
    expect(refunded.refunded!.amountKurus).toBe(26_500);
    expect(refunded.payments.filter((p) => p.kind === "refund").map((p) => [p.method, p.amountKurus])).toEqual([["peni", 6_500], ["cash", 20_000]]);
    // The ₺200 cash sale earned 10 peni nobody took; Ayşe gets her 65 back.
    expect(await balance(ayse)).toBe(before);
    expect((await app.cash.state(ece)).open!.totals).toMatchObject({ cashSalesKurus: 20_000, cashRefundsKurus: 20_000 });
  });

  it("gives pennies back on an unpaid order, before changing it, and when voiding", async () => {
    const before = await balance(ayse);
    const o = await order();
    const c = await spendCode(ayse);
    await app.till.usePeni(ece, o.id, { code: c, peni: 50, payKey: key() });
    expect(await code(app.till.update(ece, o.id, { lines: [{ productId: "cay", quantity: 1 }] }))).toBe("PENI_ON_ORDER");
    expect(await code(app.till.usePeni(ece, o.id, { code: await spendCode(mehmet), peni: 5, payKey: key() }))).toBe("PENI_OTHER_WALLET");
    const back = await app.till.returnPeni(ece, o.id);
    expect(back).toMatchObject({ peni: null, dueKurus: 26_500 });
    expect(await balance(ayse)).toBe(before);
    await app.till.update(ece, o.id, { lines: [{ productId: "latte", quantity: 1 }] });

    // Peni again, then a manager voids it: they go back once more.
    await app.till.usePeni(ece, o.id, { code: c, peni: 20, payKey: key() });
    expect(await balance(ayse)).toBe(before - 20);
    await app.till.void(leyla, o.id, { reason: "Müşteri gitti" });
    expect(await balance(ayse)).toBe(before);
  });

  it("refuses expired or unknown codes, other cafés' codes and pennies beyond the café's share", async () => {
    const o = await order();
    const c = await spendCode(ayse);
    expect(await code(app.till.checkPeni(ece, o.id, { code: c === "000000" ? "000001" : "000000" }))).toBe("SPEND_CODE_WRONG");
    now = new Date(now.getTime() + 5 * 60_000);
    expect(await code(app.till.checkPeni(ece, o.id, { code: c }))).toBe("SPEND_CODE_EXPIRED");
    const newcomer = { id: "cus_new", phone: null, email: "yeni@example.com", displayName: "", avatarUrl: null, profileVisible: false };
    await app.identity.saveCustomer(newcomer);
    expect(await code(app.spendCode(newcomer, "moda"))).toBe("NOT_A_MEMBER");

    await app.directory.saveSettings({ ...(await app.directory.getSettings("cafe_moda")), maxRedeemShareBps: 2_000 });
    const fresh = await spendCode(ayse);
    expect((await app.till.checkPeni(ece, o.id, { code: fresh })).maxPeni).toBe(53); // 20% of ₺265
    expect((await app.till.usePeni(ece, o.id, { code: fresh, peni: 500, payKey: key() })).order.peni!.peni).toBe(53);
    expect(await code(app.till.usePeni(ece, o.id, { code: fresh, peni: 1, payKey: key() }))).toBe("NOTHING_TO_SPEND");
  });
});
