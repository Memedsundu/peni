import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
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

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  [leyla, murat, hakan, ece] = await Promise.all([at("leyla"), at("murat"), at("hakan"), at("ece")]);
});

describe("Borçlar (plan piece 19)", () => {
  it("lists everything owed in one place, late first, with the card's statement worked out from its days", async () => {
    const view = await app.debts.get(murat);
    expect(view.today).toBe("2026-10-16");
    expect(view.rows.map((r) => [r.kind, r.name, r.amountKurus, r.dueDate, r.overdue])).toEqual([
      // The card's statement closed on 26 September and was due on 6 October; ₺2.000 of ₺3.700 was paid.
      ["card", "İş kartı", 170_000, "2026-10-06", true],
      ["bill", "Boğaziçi Elektrik", 385_000, "2026-10-14", true],
      // Rent was paid with a check dated the 28th: owed until the bank pays it out.
      ["check", "Ali Rıza Bey (mal sahibi)", 4_500_000, "2026-10-28", false],
      ["bill", "Kuzey Kahve Kavurma", 700_000, "2026-10-31", false],
      // Pay for the hours entered this month, and the ₺5.000 of Hakan's September still owed (piece 21).
      ["wages", "Hakan Usta", 1_820_000, null, false],
      ["wages", "Murat Aksu", 1_760_000, null, false],
      ["wages", "Ece Tan", 1_221_000, null, false],
      // Murat paid for last week's milk himself and has had ₺200 of ₺540 back.
      ["loan", "Murat Aksu", 34_000, null, false],
      ["bill", "Fırıncı Hasan", 30_000, null, false],
    ]);
    expect(view.totals).toEqual({ totalKurus: 10_620_000, overdueKurus: 555_000, weekKurus: 0 });
    expect(view.rows.find((r) => r.kind === "wages" && r.name === "Hakan Usta")!.detail).toBe("Eylül, Ekim");
    expect((await app.debts.get(await at("hakan"))).rows.some((r) => r.kind === "wages")).toBe(true);
    expect(view.card).toMatchObject({
      statementDay: 26,
      dueDay: 6,
      balanceKurus: 170_000,
      remainingKurus: 9_830_000,
      statementKurus: 170_000,
      overdueKurus: 170_000,
      nextClose: "2026-10-26",
      charges: [{ billId: "bil_seed_ambalaj", name: "Ambalaj Dünyası", amountKurus: 370_000, paidOn: "2026-09-26" }],
    });
    expect(view.checks).toMatchObject([{ number: "0048213", bankName: "Ziraat Bankası", billId: "bil_seed_kira", state: "open", removable: false }]);
    expect(view.lenders).toMatchObject([
      {
        name: "Murat Aksu",
        borrowedKurus: 54_000,
        repaidKurus: 20_000,
        owedKurus: 34_000,
        loans: [{ billId: "bil_seed_sut2", billName: "Moda Süt · Süt", leftKurus: 34_000 }],
      },
    ]);
    expect(view).toMatchObject({ canEdit: true, canCard: true, canPayBills: true, cardNotSet: false });
    // Bills paid this way still count as paid on Faturalar.
    expect((await app.bills.list(murat)).owed.totalKurus).toBe(1_115_000);
    expect((await app.staffDashboard(murat)).debts).toEqual(view.totals);
  });

  it("shows the chef what is owed without the card, and keeps it from the barista", async () => {
    const chef = await app.debts.get(hakan);
    expect(chef).toMatchObject({ card: null, cardNotSet: false, canCard: false, canEdit: true, canPayBills: false });
    expect(chef.rows.map((r) => r.kind)).not.toContain("card");
    expect(await code(app.debts.payCard(hakan, { key: key(), amountKurus: 10_000, method: "cash" }))).toBe("FORBIDDEN");
    expect(await code(app.debts.get(ece))).toBe("FORBIDDEN");
    expect((await app.staffDashboard(ece)).debts).toBeNull();
  });

  it("pays part of a bill with a check: the bill shows what is left, and the check is owed until it is cashed", async () => {
    const tap = {
      key: key(),
      method: "check" as const,
      amountKurus: 300_000,
      check: { number: " 0048214 ", bankName: "Ziraat Bankası", dueDate: "2026-11-15" },
    };
    const bill = await app.bills.pay(murat, "bil_seed_kahve", tap);
    await app.bills.pay(murat, "bil_seed_kahve", tap);
    expect(bill).toMatchObject({ paidKurus: 300_000, state: "unpaid", payWith: { leftKurus: 400_000, credit: "İş kartı", check: true, loan: true } });
    expect(bill.payments).toMatchObject([
      { method: "check", check: { number: "0048214", dueDate: "2026-11-15", cashedOn: null }, locked: null, canRemove: true },
    ]);
    const view = await app.debts.get(murat);
    expect(view.rows.find((r) => r.kind === "bill" && r.id === "bil_seed_kahve")?.amountKurus).toBe(400_000);
    const check = view.checks.find((c) => c.number === "0048214")!;
    expect(check).toMatchObject({ payee: "Kuzey Kahve Kavurma", amountKurus: 300_000, writtenOn: "2026-10-16", billId: "bil_seed_kahve", removable: false });
    expect(await code(app.debts.removeCheck(murat, check.id))).toBe("CHECK_FROM_BILL");
    // Correcting or voiding waits until every payment is undone.
    expect(await code(app.bills.void(murat, "bil_seed_kahve", { reason: "Yanlış" }))).toBe("BILL_PAID");

    expect(await code(app.debts.cashCheck(murat, check.id, { cashed: true, cashedOn: "2026-10-17" }))).toBe("CASHED_ON_INVALID");
    const cashed = await app.debts.cashCheck(murat, check.id, { cashed: true });
    expect(cashed.checks.find((c) => c.id === check.id)).toMatchObject({ state: "cashed", cashedOn: "2026-10-16", cashedBy: "Murat Aksu" });
    expect(cashed.rows.some((r) => r.id === check.id)).toBe(false);
    const paymentId = bill.payments[0]!.id;
    expect((await app.bills.get(murat, "bil_seed_kahve")).payments[0]!.locked).toBe("CHECK_CASHED");
    expect(await code(app.bills.removePayment(murat, "bil_seed_kahve", paymentId))).toBe("CHECK_CASHED");

    await app.debts.cashCheck(murat, check.id, { cashed: false });
    const undone = await app.bills.removePayment(murat, "bil_seed_kahve", paymentId);
    expect(undone).toMatchObject({ paidKurus: 0, payments: [] });
    expect((await app.debts.get(murat)).checks.map((c) => c.number)).toEqual(["0048213"]);
  });

  it("checks what a check payment needs", async () => {
    const pay = (over: object) => code(app.bills.pay(murat, "bil_seed_kahve", { key: key(), method: "check", ...over }));
    expect(await pay({})).toBe("CHECK_NUMBER_REQUIRED");
    expect(await pay({ check: { number: "1", dueDate: "2026-10-15" } })).toBe("CHECK_DUE_INVALID");
    expect(await pay({ amountKurus: 700_001, check: { number: "1", dueDate: "2026-11-01" } })).toBe("BILL_OVERPAY");
    // The chef sees Borçlar but doesn't pay bills.
    expect(await code(app.bills.pay(hakan, "bil_seed_kahve", { key: key(), method: "check", check: { number: "1", dueDate: "2026-11-01" } }))).toBe(
      "FORBIDDEN",
    );
  });

  it("makes a bill paid from someone's pocket owed to them, and pays their oldest loans back first", async () => {
    expect(await code(app.bills.pay(murat, "bil_seed_simit", { key: key(), method: "loan" }))).toBe("LENDER_REQUIRED");
    const simit = await app.bills.pay(murat, "bil_seed_simit", { key: key(), method: "loan", lender: { name: " İlker  Abi " }, loanDueDate: "2026-10-20" });
    expect(simit).toMatchObject({ state: "paid", payments: [{ method: "loan", lender: "İlker Abi" }] });
    await app.debts.addLoan(murat, { key: key(), lender: { name: "ilker abi" }, amountKurus: 100_000, borrowedOn: "2026-10-16", note: "Kasaya bozuk para" });

    let view = await app.debts.get(murat);
    const ilker = view.lenders.find((l) => l.name === "İlker Abi")!;
    expect(ilker).toMatchObject({ owedKurus: 130_000, dueDate: "2026-10-20" });
    expect(view.rows.find((r) => r.id === ilker.key)).toMatchObject({ kind: "loan", amountKurus: 130_000, detail: "Fırıncı Hasan · Simit, Kasaya bozuk para" });
    expect(view.totals.weekKurus).toBe(30_000);
    expect((await app.bills.get(murat, "bil_seed_kahve")).payWith?.lenderNames).toEqual(["İlker Abi"]);

    expect(await code(app.debts.repay(murat, { key: key(), lender: ilker.key, amountKurus: 130_001, method: "cash" }))).toBe("LOAN_OVERPAY");
    view = await app.debts.repay(murat, { key: key(), lender: ilker.key, amountKurus: 40_000, method: "bank" });
    const after = view.lenders.find((l) => l.key === ilker.key)!;
    // The simit came first, so it is paid off; the due date moves to what is left (none).
    expect(after.loans.map((l) => l.leftKurus)).toEqual([0, 90_000]);
    expect(after).toMatchObject({ owedKurus: 90_000, dueDate: null, repayments: [{ amountKurus: 40_000, method: "bank", by: "Murat Aksu" }] });
    // The simit's loan goes only with its bill payment; the ₺1.000 can't go while ₺400 is paid back and only ₺300 would be left.
    expect(after.loans.map((l) => l.removable)).toEqual([false, false]);
    expect(await code(app.debts.removeLoan(murat, after.loans[1]!.id))).toBe("LOAN_REPAID");
    expect(await code(app.debts.removeLoan(murat, after.loans[0]!.id))).toBe("LOAN_FROM_BILL");
    await app.bills.removePayment(murat, "bil_seed_simit", simit.payments[0]!.id);
    expect((await app.debts.get(murat)).lenders.find((l) => l.key === ilker.key)).toMatchObject({ owedKurus: 60_000 });
  });

  it("won't undo a bill's loan once it has been paid back past what the rest covers", async () => {
    const sut2 = await app.bills.get(murat, "bil_seed_sut2");
    expect(sut2.payments[0]).toMatchObject({ method: "loan", lender: "Murat Aksu", locked: "LOAN_REPAID" });
    expect(await code(app.bills.removePayment(murat, "bil_seed_sut2", sut2.payments[0]!.id))).toBe("LOAN_REPAID");
    const view = await app.debts.get(murat);
    await app.debts.removeRepayment(murat, view.lenders[0]!.repayments[0]!.id);
    expect(await app.bills.removePayment(murat, "bil_seed_sut2", sut2.payments[0]!.id)).toMatchObject({ state: "unpaid", paidKurus: 0 });
  });

  it("puts a bill on the credit card, pays the card, and keeps its days in range", async () => {
    await app.bills.pay(murat, "bil_seed_simit", { key: key(), method: "credit" });
    let card = (await app.debts.get(murat)).card!;
    expect(card).toMatchObject({ balanceKurus: 200_000, statementKurus: 170_000 });
    expect(card.charges[0]).toMatchObject({ billId: "bil_seed_simit", name: "Fırıncı Hasan", paidOn: "2026-10-16" });

    expect(await code(app.debts.payCard(murat, { key: key(), amountKurus: 200_001, method: "bank" }))).toBe("CARD_OVERPAY");
    const tap = { key: key(), amountKurus: 170_000, method: "cash" as const };
    await app.debts.payCard(murat, tap);
    card = (await app.debts.payCard(murat, tap)).card!;
    expect(card).toMatchObject({
      balanceKurus: 30_000,
      statementKurus: 0,
      overdueKurus: 0,
      payments: [{ amountKurus: 170_000, method: "cash" }, { amountKurus: 200_000 }],
    });

    expect(await code(app.debts.setCard(murat, { name: "Kart", limitKurus: 0, statementDay: 31, dueDay: 5 }))).toBe("CARD_SETTINGS_INVALID");
    expect(await code(app.debts.setCard(hakan, { name: "Kart", limitKurus: 0, statementDay: 26, dueDay: 5 }))).toBe("FORBIDDEN");
    const moved = await app.debts.setCard(leyla, { name: "Garanti iş kartı", limitKurus: 5_000_000, statementDay: 10, dueDay: 20 });
    expect(moved.card).toMatchObject({ name: "Garanti iş kartı", lastClose: "2026-10-10", dueDate: "2026-10-20", remainingKurus: 4_970_000 });
    await app.debts.removeCardPayment(murat, card.payments[0]!.id);
    expect((await app.debts.get(murat)).card!.balanceKurus).toBe(200_000);
  });

  it("adds a check on its own, once, and can take it away while it isn't cashed", async () => {
    const input = { key: key(), number: "0048300", supplierId: "sup_seed_firin", amountKurus: 250_000, dueDate: "2026-10-20" };
    await app.debts.addCheck(murat, input);
    const view = await app.debts.addCheck(murat, input);
    const check = view.checks.find((c) => c.number === "0048300")!;
    expect(check).toMatchObject({ payee: "Fırıncı Hasan", billId: null, removable: true, state: "open" });
    expect(view.totals.weekKurus).toBe(250_000);
    expect(await code(app.debts.addCheck(murat, { ...input, key: key(), supplierId: null }))).toBe("PAYEE_REQUIRED");
    expect(await code(app.debts.addCheck(murat, { ...input, key: key(), writtenOn: "2026-10-21" }))).toBe("DATE_INVALID");
    expect((await app.debts.removeCheck(murat, check.id)).checks.map((c) => c.number)).toEqual(["0048213"]);
  });
});
