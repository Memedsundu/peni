import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { setCafePlan } from "./plans";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let ece: StaffContext;
let ayse: CustomerRecord;
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
const balance = async () => (await app.cafeDetail("moda", ayse)).membership!.balancePeni;

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  // A café on its own till: pennies, but no Penny till (N11).
  await setCafePlan(app.identity, "moda", { plan: "penny" }, now);
  ece = await app.staff.at((await app.staff.signIn(DEMO_STAFF.ece.email, DEMO_STAFF_PASSWORD)).token, "moda");
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
});

describe("the penny screen (N11)", () => {
  it("gives a code for a sale on the café's own till, which the customer takes once", async () => {
    expect(await code(app.till.create(ece, { createKey: key(), lines: [{ productId: "cay", quantity: 1 }] }))).toBe("PLAN_NEEDED");
    const before = await balance();
    const k = key();
    const { given, codes } = await app.counter.give(ece, { amountKurus: 18_000, key: k });
    // ₺180 at Moda's 5%.
    expect(given).toMatchObject({ peni: 9, paidKurus: 18_000, givenBy: "Ece", state: "open" });
    expect(given.code).toMatch(/^\d{4}$/);
    expect(codes.map((c) => c.id)).toEqual([given.id]);
    // The same key again (a double tap) gives the same code.
    expect((await app.counter.give(ece, { amountKurus: 18_000, key: k })).given.id).toBe(given.id);

    await app.takeClaim(ayse, { token: given.token });
    expect(await balance()).toBe(before + 9);
    expect(await code(app.takeClaim(ayse, { cafeSlug: "moda", code: given.code }))).toBe("ok");
    expect(await balance()).toBe(before + 9);
    expect((await app.counter.view(ece)).codes[0]!.state).toBe("claimed");
    expect(await code(app.counter.cancel(ece, given.id))).toBe("CLAIM_TAKEN");
  });

  it("takes back a code typed wrong, and refuses sales that earn nothing", async () => {
    const { given } = await app.counter.give(ece, { amountKurus: 1_800_00, key: key() });
    const after = await app.counter.cancel(ece, given.id);
    expect(after.codes[0]!.state).toBe("cancelled");
    expect(await code(app.takeClaim(ayse, { token: given.token }))).toBe("CLAIM_CANCELLED");
    // ₺10 at 5% is half a penny.
    expect(await code(app.counter.give(ece, { amountKurus: 1_000, key: key() }))).toBe("PENNY_TOO_SMALL");
  });

  it("takes pennies off a bill paid on the café's own till, within the café's rules", async () => {
    const before = await balance();
    expect(before).toBeGreaterThan(20);
    const spendCode = (await app.spendCode(ayse, "moda")).code;
    const check = await app.counter.check(ece, { code: spendCode, amountKurus: 2_000 });
    expect(check).toMatchObject({ name: "Ayşe Y.", balancePeni: before, maxPeni: 20 });

    const k = key();
    const spent = await app.counter.spend(ece, { code: spendCode, amountKurus: 2_000, peni: 50, key: k });
    expect(spent).toEqual({ name: "Ayşe Y.", peni: 20, balancePeni: before - 20 });
    // A retry takes them once.
    expect((await app.counter.spend(ece, { code: spendCode, amountKurus: 2_000, peni: 50, key: k })).balancePeni).toBe(before - 20);
  });

  it("gives an askı item to whoever asks, from the pool", async () => {
    const { askida } = await app.counter.view(ece);
    const cay = askida.items.find((i) => i.productId === "cay")!;
    expect(cay.available).toBeGreaterThan(0);
    const k = key();
    const after = await app.counter.giveAskida(ece, { productId: "cay", key: k });
    expect(after.askida.balancePeni).toBe(askida.balancePeni - cay.peni);
    expect((await app.counter.giveAskida(ece, { productId: "cay", key: k })).askida.balancePeni).toBe(askida.balancePeni - cay.peni);
    expect(await code(app.counter.giveAskida(ece, { productId: "latte", key: key() }))).toBe("PRODUCT_NOT_ELIGIBLE");
  });

  it("isn't there on Topluluk", async () => {
    await setCafePlan(app.identity, "moda", { plan: "topluluk" }, now);
    const free = await app.staff.at((await app.staff.signIn(DEMO_STAFF.ece.email, DEMO_STAFF_PASSWORD)).token, "moda");
    expect(await code(app.counter.view(free))).toBe("PLAN_NEEDED");
    expect(await code(app.counter.give(free, { amountKurus: 18_000, key: key() }))).toBe("PLAN_NEEDED");
  });
});
