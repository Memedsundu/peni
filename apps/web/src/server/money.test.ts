import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp, type PeniStores } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let stores: PeniStores;
let now: Date;
let leyla: StaffContext;
let murat: StaffContext;
let hakan: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e: { code?: string }) => e.code,
  );
let keys = 0;
const key = () => `key-${String(++keys).padStart(6, "0")}`;
const sell = async (productId: string, method: "cash" | "card") => {
  const o = await app.till.create(ece, { createKey: key(), lines: [{ productId, quantity: 1 }] });
  const started = await app.till.pay(ece, o.id, { method, payKey: key() });
  return method === "card" ? (await app.till.confirmPayment(ece, o.id, started.payment.id)).order : started.order;
};
const drawerMoves = async () => {
  const open = (await app.cash.state(ece)).open!;
  return open.moves.map((m) => [m.kind, m.amountKurus, m.reason]);
};

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  stores = inMemoryStores();
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, stores);
  await seed(app);
  [leyla, murat, hakan, ece] = await Promise.all([at("leyla"), at("murat"), at("hakan"), at("ece")]);
});

describe("Nakit ve banka (plan piece 20)", () => {
  it("shows what each account holds and what moved it, from the day the café started", async () => {
    const view = await app.money.get(murat);
    expect(view.started).toEqual({ on: "2026-09-28", by: "Leyla Kara" });
    // ₺12.000 less the milk (₺860), the week's deposit (₺5.000) and Murat's ₺200.
    expect(view.reserveKurus).toBe(594_000);
    // ₺85.000 less the card payment (₺2.000), plus the deposit, less the bank's fee.
    expect(view.bankKurus).toBe(8_795_250);
    expect(view.drawer).toEqual({ balanceKurus: null, open: false, sessionId: null });
    expect(view.totalKurus).toBe(594_000 + 8_795_250);
    expect(view.lines.map((l) => [l.day, l.account, l.kind, l.amountKurus, l.counterpart, l.label ?? l.note])).toEqual([
      ["2026-10-14", "bank", "correction", -4_750, null, "Ekstrede hesap işletim ücreti"],
      ["2026-10-13", "reserve", "repayment", -20_000, null, "Murat Aksu"],
      ["2026-10-07", "bank", "transfer", 500_000, "reserve", "Haftalık yatırma"],
      ["2026-10-07", "reserve", "transfer", -500_000, "bank", "Haftalık yatırma"],
      ["2026-10-04", "bank", "card", -200_000, null, "İş kartı"],
      ["2026-09-30", "reserve", "bill", -86_000, null, "Moda Süt"],
      ["2026-09-28", "bank", "opening", 8_500_000, null, null],
      ["2026-09-28", "reserve", "opening", 1_200_000, null, null],
    ]);
    expect(view.lines.find((l) => l.kind === "bill")!.billId).toBe("bil_seed_sut1");
    expect(view.lines.filter((l) => l.undoId).map((l) => l.undoId)).toEqual(["seed_fix", "seed_transfer", "seed_transfer"]);
    expect(await code(app.money.get(hakan))).toBe("FORBIDDEN");
  });

  it("puts card sales into the bank and cash sales into the drawer, day by day", async () => {
    await app.cash.open(ece, { key: key(), countKurus: 50_000 });
    await sell("latte", "cash");
    await sell("turk", "card");
    await sell("latte", "card");
    const view = await app.money.get(murat);
    expect(view.bankKurus).toBe(8_795_250 + 9_000 + 12_000);
    expect(view.drawer).toMatchObject({ balanceKurus: 50_000 + 12_000, open: true });
    expect(view.lines.filter((l) => l.kind === "sales").map((l) => [l.account, l.amountKurus])).toEqual([
      ["bank", 21_000],
      ["drawer", 12_000],
    ]);
  });

  it("takes a cash bill out of the open drawer as a Kasa move, and the bank's from the bank", async () => {
    await app.cash.open(ece, { key: key(), countKurus: 500_000 });
    const elektrik = await app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "cash", amountKurus: 100_000 });
    expect(elektrik.payments.at(-1)).toMatchObject({ method: "cash", account: "drawer" });
    expect(await drawerMoves()).toEqual([["out", 100_000, "Fatura · Boğaziçi Elektrik"]]);
    expect((await app.cash.state(ece)).open!.totals.expectedKurus).toBe(400_000);

    const byBank = await app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "bank", amountKurus: 50_000 });
    expect(byBank.payments.at(-1)).toMatchObject({ method: "bank", account: "bank" });
    expect((await app.money.get(murat)).bankKurus).toBe(8_795_250 - 50_000);

    // Undone while the drawer is still open: the move goes with it.
    await app.bills.removePayment(murat, "bil_seed_elektrik", elektrik.payments.at(-1)!.id);
    await app.bills.removePayment(murat, "bil_seed_elektrik", byBank.payments.at(-1)!.id);
    expect(await drawerMoves()).toEqual([]);
    expect((await app.money.get(murat)).bankKurus).toBe(8_795_250);

    // More than the drawer holds can't come out of it; the reserve can pay instead.
    expect(await code(app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "cash", from: "drawer" }))).toBe("ok");
    expect(await code(app.bills.pay(murat, "bil_seed_kahve", { key: key(), method: "cash", from: "drawer" }))).toBe("CASH_TOO_LOW");
    expect(await code(app.bills.pay(murat, "bil_seed_kahve", { key: key(), method: "cash", from: "reserve" }))).toBe("RESERVE_TOO_LOW");
    expect(await code(app.bills.pay(murat, "bil_seed_kahve", { key: key(), method: "cash", amountKurus: 100_000, from: "reserve" }))).toBe("ok");
    expect((await app.money.get(murat)).reserveKurus).toBe(494_000);
  });

  it("puts the money back into today's drawer when the day it came out of is closed", async () => {
    const day1 = await app.cash.open(ece, { key: key(), countKurus: 200_000 });
    const paid = await app.bills.pay(murat, "bil_seed_simit", { key: key(), method: "cash" });
    await app.cash.close(ece, { key: key(), sessionId: day1.open!.id, countKurus: 170_000 });
    const payment = paid.payments.at(-1)!;
    expect(await code(app.bills.removePayment(murat, "bil_seed_simit", payment.id))).toBe("CASH_CLOSED_UNDO");
    await app.cash.open(ece, { key: key(), countKurus: 170_000 });
    await app.bills.removePayment(murat, "bil_seed_simit", payment.id);
    expect(await drawerMoves()).toEqual([["in", 30_000, "Geri alındı · Fatura · Fırıncı Hasan"]]);
    const back = (await app.money.get(murat)).lines.find((l) => l.reversal)!;
    expect(back).toMatchObject({ account: "drawer", kind: "bill", amountKurus: 30_000, label: "Fırıncı Hasan", billId: null });
  });

  it("takes a check out of the bank on the day it is cashed, and puts it back when that is undone", async () => {
    await app.debts.cashCheck(murat, "chk_seed_kira", { cashed: true, cashedOn: "2026-10-15" });
    let view = await app.money.get(murat);
    expect(view.bankKurus).toBe(8_795_250 - 4_500_000);
    expect(view.lines[0]).toMatchObject({ day: "2026-10-15", account: "bank", kind: "check", amountKurus: -4_500_000, label: "0048213" });
    await app.debts.cashCheck(murat, "chk_seed_kira", { cashed: false });
    view = await app.money.get(murat);
    expect(view.bankKurus).toBe(8_795_250);
  });

  it("pays people back and the credit card from where the money is, the reserve for managers only", async () => {
    const lender = (await app.debts.get(murat)).lenders[0]!.key;
    expect(await code(app.debts.repay(hakan, { key: key(), lender, amountKurus: 10_000, method: "cash", from: "reserve" }))).toBe("FORBIDDEN");
    // The drawer is closed, so cash would have to come from the reserve.
    expect(await code(app.debts.repay(hakan, { key: key(), lender, amountKurus: 10_000, method: "cash" }))).toBe("FORBIDDEN");
    await app.cash.open(ece, { key: key(), countKurus: 50_000 });
    const repaid = await app.debts.repay(hakan, { key: key(), lender, amountKurus: 10_000, method: "cash" });
    expect(repaid.lenders[0]!.repayments[0]).toMatchObject({ amountKurus: 10_000, account: "drawer" });
    expect(await drawerMoves()).toEqual([["out", 10_000, "Borç ödemesi · Murat Aksu"]]);

    const card = await app.debts.payCard(murat, { key: key(), amountKurus: 70_000, method: "bank" });
    expect(card.card!.payments[0]).toMatchObject({ amountKurus: 70_000, account: "bank" });
    expect((await app.money.get(murat)).bankKurus).toBe(8_795_250 - 70_000);
    await app.debts.removeCardPayment(murat, card.card!.payments[0]!.id);
    expect((await app.money.get(murat)).bankKurus).toBe(8_795_250);
    expect(repaid.cashFrom).toEqual({ drawerOpen: true, reserve: false });
    expect((await app.debts.get(murat)).cashFrom).toEqual({ drawerOpen: true, reserve: true });
  });

  it("moves money between accounts, puts it in, takes it out and corrects it, each once", async () => {
    expect(await code(app.money.move(murat, { key: key(), kind: "transfer", account: "drawer", to: "reserve", amountKurus: 10_000 }))).toBe("CASH_CLOSED");
    await app.cash.open(ece, { key: key(), countKurus: 300_000 });
    const k = key();
    await app.money.move(murat, { key: k, kind: "transfer", account: "drawer", to: "reserve", amountKurus: 200_000 });
    let view = await app.money.move(murat, { key: k, kind: "transfer", account: "drawer", to: "reserve", amountKurus: 200_000 });
    expect(view.reserveKurus).toBe(794_000);
    expect(view.drawer.balanceKurus).toBe(100_000);
    expect(await drawerMoves()).toEqual([["out", 200_000, "Ayrı kasaya konuldu"]]);
    expect(view.lines.slice(0, 2).map((l) => [l.account, l.kind, l.amountKurus, l.counterpart])).toEqual([
      ["reserve", "transfer", 200_000, "drawer"],
      ["drawer", "transfer", -200_000, "reserve"],
    ]);

    expect(await code(app.money.move(murat, { key: key(), kind: "transfer", account: "reserve", to: "reserve", amountKurus: 1 }))).toBe("SAME_ACCOUNT");
    expect(await code(app.money.move(murat, { key: key(), kind: "transfer", account: "reserve", to: "bank", amountKurus: 900_000 }))).toBe("RESERVE_TOO_LOW");
    expect(await code(app.money.move(murat, { key: key(), kind: "deposit", account: "bank", amountKurus: 100_000 }))).toBe("NOTE_REQUIRED");
    expect(await code(app.money.move(murat, { key: key(), kind: "withdraw", account: "drawer", amountKurus: 100, note: "x" }))).toBe("ACCOUNT_INVALID");
    expect(await code(app.money.move(murat, { key: key(), kind: "withdraw", account: "reserve", amountKurus: 900_000, note: "Kira" }))).toBe("RESERVE_TOO_LOW");
    view = await app.money.move(murat, { key: key(), kind: "deposit", account: "bank", amountKurus: 1_000_000, note: "Leyla'dan sermaye" });
    expect(view.bankKurus).toBe(9_795_250);
    view = await app.money.move(murat, { key: key(), kind: "correction", account: "bank", amountKurus: 9_790_000, note: "Ekstre" });
    expect(view.bankKurus).toBe(9_790_000);
    expect(view.lines[0]).toMatchObject({ kind: "correction", amountKurus: -5_250, note: "Ekstre", by: "Murat Aksu" });
    expect(await code(app.money.move(murat, { key: key(), kind: "correction", account: "bank", amountKurus: 9_790_000, note: "Ekstre" }))).toBe("SAME_BALANCE");
    expect(await code(app.money.move(hakan, { key: key(), kind: "deposit", account: "bank", amountKurus: 100, note: "x" }))).toBe("FORBIDDEN");

    // "Geri al": the whole transfer, both sides, while its drawer day is open.
    const transfer = view.lines.find((l) => l.account === "drawer" && l.kind === "transfer")!;
    view = await app.money.undo(murat, transfer.undoId!);
    expect(view.reserveKurus).toBe(594_000);
    expect(await drawerMoves()).toEqual([]);
  });

  it("starts once, with what the reserve and the bank hold; until then nothing is followed", async () => {
    const leylaK = await at("leyla", "kuzguncuk");
    let view = await app.money.get(leylaK);
    expect(view).toMatchObject({ started: null, reserveKurus: null, bankKurus: null, totalKurus: null, lines: [] });
    expect(await code(app.money.move(leylaK, { key: key(), kind: "deposit", account: "bank", amountKurus: 100, note: "x" }))).toBe("MONEY_NOT_STARTED");
    view = await app.money.start(leylaK, { reserveKurus: 300_000, bankKurus: 1_500_000 });
    expect(view).toMatchObject({ started: { on: "2026-10-16", by: "Leyla Kara" }, reserveKurus: 300_000, bankKurus: 1_500_000 });
    expect(await code(app.money.start(leylaK, { reserveKurus: 0, bankKurus: 0 }))).toBe("MONEY_STARTED");
  });
});

describe("Ay kapanışı (plan piece 20)", () => {
  it("closes last month with its numbers, and then nothing dated in it changes", async () => {
    const months = await app.money.months(murat);
    expect(months).toMatchObject({ today: "2026-10-16", closedThrough: null, closes: [], canClose: false });
    expect(months.next!.month).toBe("2026-09");
    expect(months.next!.summary).toEqual({
      month: "2026-09",
      from: "2026-09-01",
      to: "2026-09-30",
      sales: { cashKurus: 0, cardKurus: 0, totalKurus: 0 },
      // The packaging (on the card) and the milk (cash).
      bills: { count: 2, totalKurus: 456_000, paidKurus: { credit: 370_000, cash: 86_000 } },
      money: { drawerKurus: null, reserveKurus: 1_114_000, bankKurus: 8_500_000 },
      owed: { billsKurus: 0, checksKurus: 0, loansKurus: 0, cardKurus: 370_000, totalKurus: 370_000 },
    });
    expect(await code(app.money.closeMonth(murat, { month: "2026-09" }))).toBe("FORBIDDEN");
    expect(await code(app.money.closeMonth(leyla, { month: "2026-10" }))).toBe("MONTH_NOT_CLOSABLE");
    expect(await code(app.money.closeMonth(leyla, { month: "2026-08" }))).toBe("MONTH_NOT_CLOSABLE");

    const closed = await app.money.closeMonth(leyla, { month: "2026-09", note: "Muhasebeciye gönderildi" });
    expect(closed).toMatchObject({ closedThrough: "2026-09-30", next: null, canClose: true });
    expect(closed.closes).toMatchObject([{ month: "2026-09", by: "Leyla Kara", note: "Muhasebeciye gönderildi", canReopen: true, reopenedAt: null }]);
    expect((await app.money.closeMonth(leyla, { month: "2026-09" })).closes).toHaveLength(1);

    // September's bills and payments are fixed now; October's aren't.
    const ambalaj = await app.bills.get(murat, "bil_seed_ambalaj");
    expect(ambalaj.closed).toBe(true);
    expect(ambalaj.payments[0]!.canRemove).toBe(false);
    expect(await code(app.bills.removePayment(murat, "bil_seed_ambalaj", ambalaj.payments[0]!.id))).toBe("PERIOD_CLOSED");
    expect(await code(app.bills.void(murat, "bil_seed_sut1", { reason: "x" }))).toBe("PERIOD_CLOSED");
    const milk = { supplierId: "sup_seed_sut", date: "2026-09-29", lines: [{ itemId: "stk_sut", qtyMilli: 10_000, totalKurus: 45_000 }] };
    expect(await code(app.bills.add(murat, { key: key(), ...milk }))).toBe("PERIOD_CLOSED");
    expect(await code(app.bills.add(murat, { key: key(), ...milk, date: "2026-10-01" }))).toBe("ok");
    expect(await code(app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "bank", paidOn: "2026-09-30" }))).toBe("PAID_ON_INVALID");
    expect(await code(app.debts.addLoan(murat, { key: key(), lender: { name: "Ayşe" }, amountKurus: 1_000, borrowedOn: "2026-09-15" }))).toBe("PERIOD_CLOSED");
    expect((await app.debts.get(murat)).closedThrough).toBe("2026-09-30");
    expect((await app.money.get(murat)).closedThrough).toBe("2026-09-30");
    // Its numbers stay as they were, whatever is written later.
    expect((await app.money.months(murat)).closes[0]!.summary.money.reserveKurus).toBe(1_114_000);
  });

  it("reopens only the last close, with why, and it can be closed again", async () => {
    await app.money.closeMonth(leyla, { month: "2026-09" });
    const close = (await app.money.months(leyla)).closes[0]!;
    expect(await code(app.money.reopen(murat, close.id, { reason: "Eksik fatura" }))).toBe("FORBIDDEN");
    expect(await code(app.money.reopen(leyla, close.id, { reason: " " }))).toBe("REASON_REQUIRED");
    const reopened = await app.money.reopen(leyla, close.id, { reason: "Eksik fatura" });
    expect(reopened).toMatchObject({ closedThrough: null, next: { month: "2026-09" } });
    expect(reopened.closes[0]).toMatchObject({ reopenedBy: "Leyla Kara", reopenReason: "Eksik fatura", canReopen: false });
    expect(await code(app.bills.void(murat, "bil_seed_sut1", { reason: "x" }))).toBe("BILL_PAID");
    now = new Date(now.getTime() + 60_000);
    const again = await app.money.closeMonth(leyla, { month: "2026-09" });
    expect(again.closes.map((c) => [c.month, !!c.reopenedAt, c.canReopen])).toEqual([
      ["2026-09", false, true],
      ["2026-09", true, false],
    ]);
  });
});
