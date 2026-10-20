import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type CustomerRecord } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let ece: StaffContext;
let leyla: StaffContext;
let ayse: CustomerRecord;
let newcomer: CustomerRecord;
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);

/** Ece sells a latte (₺120, 6 peni at Moda's 5%) for cash; the customer screen gets the claim. */
async function sale() {
  const o = await app.till.create(ece, { createKey: key(), lines: [{ productId: "latte", quantity: 1 }] });
  const paid = await app.till.pay(ece, o.id, { method: "cash", payKey: key() });
  return { order: paid.order, claim: paid.order.claim! };
}
const balanceAtModa = async (c: CustomerRecord) => (await app.wallet(c)).cafes.find((x) => x.cafeSlug === "moda")?.balancePeni ?? null;

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  ece = await app.staff.at((await app.staff.signIn(DEMO_STAFF.ece.email, DEMO_STAFF_PASSWORD)).token, "moda");
  leyla = await app.staff.at((await app.staff.signIn(DEMO_STAFF.leyla.email, DEMO_STAFF_PASSWORD)).token, "moda");
  await app.cash.open(ece, { key: "open-the-drawer", countKurus: 50_000 });
  ayse = (await app.identity.getCustomer("cus_ayse"))!;
  newcomer = { id: "cus_new", phone: null, email: "yeni@example.com", displayName: "", avatarUrl: null, profileVisible: false };
  await app.identity.saveCustomer(newcomer);
});

describe("earning pennies with the claim QR or code (plan piece 10)", () => {
  it("shows the QR's pennies to anyone, then credits it once to whoever takes it", async () => {
    const { claim } = await sale();
    expect(await app.claimPreview(claim.token, null)).toMatchObject({ cafeSlug: "moda", peni: 6, state: "open", balancePeni: null });
    const before = (await balanceAtModa(ayse))!;

    const taken = await app.takeClaim(ayse, { token: claim.token });
    expect(taken).toMatchObject({ state: "yours", peni: 6, balancePeni: before + 6, joined: false });
    expect(await balanceAtModa(ayse)).toBe(before + 6);
    // Tapping again changes nothing; anyone else sees it's gone.
    expect((await app.takeClaim(ayse, { token: claim.token })).balancePeni).toBe(before + 6);
    expect((await app.claimPreview(claim.token, null)).state).toBe("taken");
    expect(await code(app.takeClaim(newcomer, { token: claim.token }))).toBe("CLAIM_TAKEN");
    expect(await balanceAtModa(newcomer)).toBeNull(); // a taken code makes nobody a member
    expect((await app.wallet(ayse)).ledger[0]).toMatchObject({ kind: "earn", peni: 6, cafeSlug: "moda" });
  });

  it("takes a typed code for the café, and makes a newcomer a member", async () => {
    const { claim } = await sale();
    expect(await balanceAtModa(newcomer)).toBeNull();
    const taken = await app.takeClaim(newcomer, { cafeSlug: "moda", code: claim.code });
    expect(taken).toMatchObject({ state: "yours", balancePeni: 6, joined: true });
    expect(await balanceAtModa(newcomer)).toBe(6);
    // The same code at another café is just wrong.
    expect(await code(app.takeClaim(ayse, { cafeSlug: "kuzguncuk", code: claim.code }))).toBe("CLAIM_CODE_WRONG");
  });

  it("allows only a few wrong codes an hour", async () => {
    const { claim } = await sale();
    const wrong = claim.code === "0000" ? "0001" : "0000";
    for (let i = 0; i < 10; i++) expect(await code(app.takeClaim(newcomer, { cafeSlug: "moda", code: wrong }))).toBe("CLAIM_CODE_WRONG");
    // Even the right code waits now.
    expect(await code(app.takeClaim(newcomer, { cafeSlug: "moda", code: claim.code }))).toBe("CLAIM_CODE_LIMITED");
    now = new Date(now.getTime() + 3_600_001);
    expect((await app.takeClaim(newcomer, { cafeSlug: "moda", code: claim.code })).state).toBe("yours");
  });

  it("closes at the end of the café's day, and with a refund", async () => {
    const first = await sale();
    const second = await sale();
    await app.till.refund(leyla, first.order.id, { reason: "Yanlış ürün" });
    expect((await app.claimPreview(first.claim.token, null)).state).toBe("cancelled");
    expect(await code(app.takeClaim(ayse, { token: first.claim.token }))).toBe("CLAIM_CANCELLED");

    now = new Date("2026-10-16T21:00:00Z"); // midnight in Istanbul
    expect((await app.claimPreview(second.claim.token, ayse)).state).toBe("expired");
    expect(await code(app.takeClaim(ayse, { token: second.claim.token }))).toBe("CLAIM_EXPIRED");
    expect(await code(app.claimPreview("no-such-token-at-all", null))).toBe("CLAIM_NOT_FOUND");
  });

  it("takes taken pennies back out of the wallet when the sale is refunded", async () => {
    const { order, claim } = await sale();
    await app.takeClaim(newcomer, { token: claim.token });
    await app.till.refund(leyla, order.id, { reason: "İade" });
    expect(await balanceAtModa(newcomer)).toBe(0);
    expect((await app.claimPreview(claim.token, newcomer)).state).toBe("yours");
  });
});
