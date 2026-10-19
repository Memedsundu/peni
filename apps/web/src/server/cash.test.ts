import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let ece: StaffContext;
let murat: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code);
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const sell = async (productId: string, method: "cash" | "card", tenderedKurus?: number) => {
  const o = await app.till.create(ece, { createKey: key(), lines: [{ productId, quantity: 1 }] });
  const started = await app.till.pay(ece, o.id, { method, payKey: key(), tenderedKurus });
  return method === "card" ? (await app.till.confirmPayment(ece, o.id, started.payment.id)).order : started.order;
};
const later = (minutes: number) => {
  now = new Date(now.getTime() + minutes * 60_000);
};

beforeEach(async () => {
  now = new Date("2026-10-16T06:00:00Z"); // 09:00 in Istanbul
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, stores);
  await seed(app);
  ece = await at("ece");
  murat = await at("murat");
});

describe("the drawer's sessions (plan piece 9)", () => {
  it("takes no cash while the drawer is closed; a card still goes through", async () => {
    const o = await app.till.create(ece, { createKey: key(), lines: [{ productId: "cay", quantity: 1 }] });
    expect(await code(app.till.pay(ece, o.id, { method: "cash", payKey: key() }))).toBe("CASH_CLOSED");
    const card = await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    expect((await app.till.confirmPayment(ece, o.id, card.payment.id)).order.status).toBe("paid");
    expect((await stores.payments.listPayments("cafe_moda", [o.id]))[0]!.cashSessionId).toBeNull();
  });

  it("opens the first time with whatever is counted, once however often the tap is retried", async () => {
    expect((await app.cash.state(ece)).open).toBeNull();
    const openKey = key();
    const state = await app.cash.open(ece, { key: openKey, counts: { "20000": 2, "1000": 5, "50": 4 } });
    expect(state.open!.opening).toMatchObject({ by: "Ece Tan", expectedKurus: null, countKurus: 45_200, differenceKurus: 0, counts: { "20000": 2, "1000": 5, "50": 4 } });
    expect((await app.cash.open(ece, { key: openKey, countKurus: 45_200 })).open!.id).toBe(state.open!.id);
    expect(await code(app.cash.open(murat, { key: key(), countKurus: 0 }))).toBe("CASH_ALREADY_OPEN");
  });

  it("checks counts made by notes and coins", async () => {
    expect(await code(app.cash.open(ece, { key: key(), counts: { "300": 1 } }))).toBe("COUNT_INVALID");
    expect(await code(app.cash.open(ece, { key: key(), counts: { "20000": -1 } }))).toBe("COUNT_INVALID");
    expect(await code(app.cash.open(ece, { key: key(), counts: { "20000": 1 }, countKurus: 30_000 }))).toBe("COUNT_INVALID");
    expect(await code(app.cash.open(ece, { key: key() }))).toBe("COUNT_INVALID");
  });

  it("adds up what the drawer should hold: cash in, change out, refunds, and moves with a reason", async () => {
    await app.cash.open(ece, { key: key(), countKurus: 50_000 });
    await sell("latte", "cash", 20_000); // ₺120, ₺80 change: the drawer gains ₺120
    await sell("cay", "cash");
    const toRefund = await sell("simit", "cash");
    await sell("turk", "card");
    await app.till.refund(murat, toRefund.id, { reason: "Bayattı" });
    expect(await code(app.cash.move(ece, { key: key(), kind: "out", amountKurus: 4_500, reason: "  " }))).toBe("REASON_REQUIRED");
    await app.cash.move(ece, { key: key(), kind: "out", amountKurus: 4_500, reason: "Süt aldım" });
    await app.cash.move(murat, { key: key(), kind: "in", amountKurus: 10_000, reason: "Bozuk para" });
    expect(await code(app.cash.move(ece, { key: key(), kind: "out", amountKurus: 1_000_000, reason: "Fazla" }))).toBe("CASH_TOO_LOW");

    const open = (await app.cash.state(ece)).open!;
    expect(open.totals).toEqual({
      cashSalesKurus: 17_500,
      cashRefundsKurus: 2_500,
      inKurus: 10_000,
      outKurus: 4_500,
      cardSalesKurus: 9_000,
      cardRefundsKurus: 0,
      expectedKurus: 50_000 + 17_500 - 2_500 + 10_000 - 4_500,
    });
    expect(open.moves.map((m) => [m.kind, m.amountKurus, m.reason, m.by])).toEqual([
      ["out", 4_500, "Süt aldım", "Ece Tan"],
      ["in", 10_000, "Bozuk para", "Murat Aksu"],
    ]);
  });

  it("closes with a count, asking why when it doesn't match, and the next opening starts from it", async () => {
    const opened = (await app.cash.open(ece, { key: key(), countKurus: 50_000 })).open!;
    await sell("latte", "cash");
    later(8 * 60);
    expect(await code(app.cash.close(ece, { key: key(), sessionId: "cash_other", countKurus: 62_000 }))).toBe("CASH_SESSION_CHANGED");
    expect(await code(app.cash.close(ece, { key: key(), sessionId: opened.id, countKurus: 61_500 }))).toBe("DIFFERENCE_REASON_REQUIRED");
    const closeKey = key();
    const closed = await app.cash.close(ece, { key: closeKey, sessionId: opened.id, countKurus: 61_500, note: "Bozuk para eksik çıktı" });
    expect(closed.open).toBeNull();
    expect(closed.last!.closing).toMatchObject({ expectedKurus: 62_000, countKurus: 61_500, differenceKurus: -500, note: "Bozuk para eksik çıktı", by: "Ece Tan" });
    expect((await app.cash.close(ece, { key: closeKey, sessionId: opened.id, countKurus: 61_500 })).last!.id).toBe(opened.id);
    expect(await code(app.cash.move(ece, { key: key(), kind: "in", amountKurus: 100, reason: "x" }))).toBe("CASH_CLOSED");

    // Next morning: what was left is what should be there.
    later(12 * 60);
    expect(await code(app.cash.open(murat, { key: key(), countKurus: 60_000 }))).toBe("DIFFERENCE_REASON_REQUIRED");
    const next = await app.cash.open(murat, { key: key(), countKurus: 61_500 });
    expect(next.open!.opening).toMatchObject({ expectedKurus: 61_500, differenceKurus: 0, by: "Murat Aksu" });
    // Refunding yesterday's cash sale comes out of today's drawer.
    const yesterday = (await app.till.list(murat, { businessDay: "2026-10-16" })).orders[0]!;
    await app.till.refund(murat, yesterday.id, { reason: "Dünkü latte" });
    expect((await app.cash.state(murat)).open!.totals).toMatchObject({ cashRefundsKurus: 12_000, expectedKurus: 49_500 });
  });

  it("stamps a card started while the drawer is open with its session", async () => {
    const open = (await app.cash.open(ece, { key: key(), countKurus: 0 })).open!;
    const o = await app.till.create(ece, { createKey: key(), lines: [{ productId: "cay", quantity: 1 }] });
    await app.till.pay(ece, o.id, { method: "card", payKey: key() });
    expect((await stores.payments.listPayments("cafe_moda", [o.id]))[0]!.cashSessionId).toBe(open.id);
    // A card still waiting isn't counted.
    expect((await app.cash.state(ece)).open!.totals.cardSalesKurus).toBe(0);
  });
});
