import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
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
const item = async (itemId: string) => (await app.stockStore.getItem("cafe_moda", itemId))!;
const milk = (litres: number, tl: number, date = "2026-10-16") => ({
  supplierId: "sup_seed_sut",
  date,
  lines: [{ itemId: "stk_sut", qtyMilli: litres * 1000, totalKurus: tl * 100 }],
});

beforeEach(async () => {
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app);
  [murat, hakan, ece] = await Promise.all([at("murat"), at("hakan"), at("ece")]);
});

describe("Faturalar (plan piece 18)", () => {
  it("lists the month's bills with what is owed across all months, and the overdue part", async () => {
    const view = await app.bills.list(murat);
    expect(view.month).toBe("2026-10");
    expect(view.today).toBe("2026-10-16");
    // Coffee (₺7.000, due in two weeks), electricity (₺3.850, two days late) and simit (₺300).
    expect(view.owed).toEqual({ count: 3, totalKurus: 1_115_000, overdueCount: 1, overdueKurus: 385_000 });
    expect(view.bills[0]).toMatchObject({ id: "bil_seed_simit", supplierName: "Fırıncı Hasan", state: "unpaid", stock: true, summary: "Simit" });
    expect(view.bills.find((b) => b.id === "bil_seed_elektrik")).toMatchObject({ state: "overdue", stock: false });
    expect(view.bills.find((b) => b.id === "bil_seed_kira")).toMatchObject({ state: "paid", totalKurus: 4_500_000 });
    expect(view.byCategory[0]).toEqual({ category: "rent", totalKurus: 4_500_000 });
    expect(view.suppliers.map((s) => s.name)).toContain("Moda Süt");
    expect(view.items.find((i) => i.id === "stk_sut")).toMatchObject({ unit: "l", costKurus: 4_500 });
    expect(view).toMatchObject({ canAdd: true, canManage: true, canAddSupplier: true });

    const owed = await app.bills.list(murat, { show: "owed" });
    expect(owed.month).toBeNull();
    expect(owed.bills.map((b) => b.id).sort()).toEqual(["bil_seed_elektrik", "bil_seed_kahve", "bil_seed_simit"]);
    expect((await app.bills.list(murat, { month: "2026-09" })).bills.map((b) => b.id)).toEqual(["bil_seed_sut1", "bil_seed_ambalaj"]);
  });

  it("lets everyone see and add bills, and keeps correcting and paying with the manager", async () => {
    expect(await app.bills.list(ece)).toMatchObject({ canAdd: true, canManage: false, canAddSupplier: false });
    expect(await code(app.bills.pay(ece, "bil_seed_simit", { key: key(), method: "cash" }))).toBe("FORBIDDEN");
    expect(await code(app.bills.pay(hakan, "bil_seed_simit", { key: key(), method: "cash" }))).toBe("FORBIDDEN");
    expect(await code(app.bills.add(ece, { key: key(), ...milk(10, 480), paid: { method: "cash" } }))).toBe("FORBIDDEN");
    expect(await code(app.bills.correct(ece, "bil_seed_simit", { version: 1, ...milk(1, 45) }))).toBe("FORBIDDEN");
    expect(await code(app.bills.void(hakan, "bil_seed_simit", { reason: "Yanlış" }))).toBe("FORBIDDEN");
    expect((await app.bills.get(ece, "bil_seed_simit")).canManage).toBe(false);
  });

  it("adds the stock on a bill and prices the item from it, once however often the tap is retried", async () => {
    const before = await item("stk_sut");
    const input = { key: key(), ...milk(10, 480), number: "  " };
    const bill = await app.bills.add(ece, input);
    await app.bills.add(ece, input);
    expect(bill).toMatchObject({ supplierName: "Moda Süt", totalKurus: 48_000, state: "unpaid", version: 1, createdBy: "Ece Tan", number: null });
    expect(bill.lines).toEqual([
      { itemId: "stk_sut", name: "Süt", category: "ingredients", qtyMilli: 10_000, unit: "l", totalKurus: 48_000, unitKurus: 4_800 },
    ]);
    expect(await item("stk_sut")).toMatchObject({ qtyMilli: before.qtyMilli + 10_000, costKurus: 4_800 });
    const history = await app.stock.history(murat, "stk_sut");
    expect(history.moves[0]).toMatchObject({ reason: "bill", changeMilli: 10_000, note: "Moda Süt", by: "Ece Tan" });
    expect((await app.bills.list(murat)).owed.count).toBe(4);
  });

  it("keeps today's price when an older bill is entered late", async () => {
    await app.bills.add(murat, { key: key(), ...milk(10, 400, "2026-10-08") });
    expect((await item("stk_sut")).costKurus).toBe(4_500);
  });

  it("marks a bill paid on the spot or later, and can take the payment back", async () => {
    const paidNow = await app.bills.add(murat, { key: key(), ...milk(5, 225), paid: { method: "cash" } });
    expect(paidNow).toMatchObject({ state: "paid", paidKurus: 22_500 });
    expect(paidNow.payments).toEqual([
      { id: expect.any(String), amountKurus: 22_500, method: "cash", paidOn: "2026-10-16", by: "Murat Aksu", check: null, lender: null, locked: null, canRemove: true },
    ]);

    expect(await code(app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "bank", paidOn: "2026-10-17" }))).toBe("PAID_ON_INVALID");
    expect(await code(app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "bank", paidOn: "2026-09-30" }))).toBe("PAID_ON_INVALID");
    const tap = key();
    const paid = await app.bills.pay(murat, "bil_seed_elektrik", { key: tap, method: "bank", paidOn: "2026-10-15" });
    expect(paid).toMatchObject({ state: "paid", paidKurus: 385_000, payWith: null });
    // Twice is still once; another payment would be more than is owed.
    expect((await app.bills.pay(murat, "bil_seed_elektrik", { key: tap, method: "bank" })).payments).toHaveLength(1);
    expect(await code(app.bills.pay(murat, "bil_seed_elektrik", { key: key(), method: "bank" }))).toBe("BILL_OVERPAY");
    expect((await app.bills.list(murat)).owed).toMatchObject({ count: 2, overdueCount: 0 });
    expect(await code(app.bills.void(murat, "bil_seed_elektrik", { reason: "Yanlış" }))).toBe("BILL_PAID");

    const undone = await app.bills.removePayment(murat, "bil_seed_elektrik", paid.payments[0]!.id);
    expect(undone).toMatchObject({ state: "overdue", paidKurus: 0, payments: [] });
  });

  it("corrects a bill by moving stock by the difference, and refuses a stale or paid one", async () => {
    const bill = await app.bills.add(ece, { key: key(), ...milk(10, 480) });
    const before = await item("stk_sut");
    const fixed = await app.bills.correct(murat, bill.id, {
      version: 1,
      supplierId: "sup_seed_sut",
      date: "2026-10-16",
      lines: [
        { itemId: "stk_sut", qtyMilli: 8_000, totalKurus: 40_000 },
        { itemId: null, name: "Kasa depozitosu", category: "other", totalKurus: 5_000 },
      ],
    });
    expect(fixed).toMatchObject({ version: 2, totalKurus: 45_000, lineCount: 2 });
    expect(await item("stk_sut")).toMatchObject({ qtyMilli: before.qtyMilli - 2_000, costKurus: 5_000 });
    expect((await app.stock.history(murat, "stk_sut")).moves[0]).toMatchObject({ reason: "bill", changeMilli: -2_000 });

    expect(await code(app.bills.correct(murat, bill.id, { version: 1, ...milk(9, 450) }))).toBe("BILL_CHANGED");
    await app.bills.pay(murat, bill.id, { key: key(), method: "card" });
    expect(await code(app.bills.correct(murat, bill.id, { version: 2, ...milk(9, 450) }))).toBe("BILL_PAID");
  });

  it("voids a bill: its stock goes back out and the price falls back to the bill before", async () => {
    const before = await item("stk_sut");
    const bill = await app.bills.add(ece, { key: key(), ...milk(10, 480) });
    const voided = await app.bills.void(murat, bill.id, { reason: "  İki kez girilmiş " });
    expect(voided).toMatchObject({ state: "voided", voidReason: "İki kez girilmiş", voidedBy: "Murat Aksu" });
    expect(await item("stk_sut")).toMatchObject({ qtyMilli: before.qtyMilli, costKurus: 4_500 });
    // Again changes nothing; it stays in its month as "İptal" and leaves what is owed.
    await app.bills.void(murat, bill.id, { reason: "Yine" });
    expect(await item("stk_sut")).toMatchObject({ qtyMilli: before.qtyMilli });
    const view = await app.bills.list(murat);
    expect(view.bills.find((b) => b.id === bill.id)?.state).toBe("voided");
    expect(view.owed.count).toBe(3);
    expect(await code(app.bills.pay(murat, bill.id, { key: key(), method: "cash" }))).toBe("BILL_VOIDED");
    expect(await code(app.bills.void(murat, bill.id, { reason: " " }))).toBe("REASON_REQUIRED");
  });

  it("checks what a bill says", async () => {
    const add = (over: object) => code(app.bills.add(murat, { key: key(), ...milk(1, 45), ...over }));
    expect(await add({ date: "2026-10-17" })).toBe("BILL_DATE_INVALID");
    expect(await add({ date: "2026-02-30" })).toBe("BILL_DATE_INVALID");
    expect(await add({ dueDate: "2026-10-15" })).toBe("BILL_DUE_INVALID");
    expect(await add({ supplierId: "sup_nope" })).toBe("SUPPLIER_NOT_FOUND");
    expect(await add({ lines: [{ itemId: "stk_sut", qtyMilli: 0, totalKurus: 100 }] })).toBe("BILL_LINE_INVALID");
    expect(await add({ lines: [{ itemId: null, category: "rent", totalKurus: 100 }] })).toBe("BILL_LINE_INVALID");
    expect(await add({ lines: [{ itemId: null, name: "Tamir", totalKurus: 100 }] })).toBe("BILL_LINE_INVALID");
    expect(await add({ lines: [{ itemId: "stk_nope", qtyMilli: 1_000, totalKurus: 100 }] })).toBe("STOCK_ITEM_NOT_FOUND");
    expect(await add({ lines: [{ itemId: "stk_sut", qtyMilli: 1_000, totalKurus: 0 }] })).toBe("BILL_TOTAL_ZERO");
    expect(
      await add({
        lines: [
          { itemId: "stk_sut", qtyMilli: 1_000, totalKurus: 4_500 },
          { itemId: "stk_sut", qtyMilli: 1_000, totalKurus: 4_500 },
        ],
      }),
    ).toBe("BILL_LINE_DUPLICATE");
    // A free extra on a paid bill is fine, and a bill needs no supplier (a market receipt).
    expect(
      await add({
        supplierId: null,
        lines: [
          { itemId: "stk_limon", qtyMilli: 2_000, totalKurus: 12_000 },
          { itemId: "stk_nane", qtyMilli: 2_000, totalKurus: 0 },
        ],
      }),
    ).toBe("ok");
    // The free mint didn't get a price of zero.
    expect((await item("stk_nane")).costKurus).toBeNull();
  });
});

describe("Tedarikçiler (plan piece 18)", () => {
  it("lists suppliers owed most first, for the back of house only", async () => {
    const view = await app.bills.suppliers(hakan);
    expect(view.suppliers.slice(0, 3).map((s) => [s.name, s.owedKurus, s.overdueKurus])).toEqual([
      ["Kuzey Kahve Kavurma", 700_000, 0],
      ["Boğaziçi Elektrik", 385_000, 385_000],
      ["Fırıncı Hasan", 30_000, 0],
    ]);
    expect(view.owedKurus).toBe(1_115_000);
    expect(view.suppliers.find((s) => s.name === "Moda Süt")).toMatchObject({ owedKurus: 0, lastBillDate: "2026-10-10", monthKurus: 140_000 });
    expect(view.canEdit).toBe(true);
    expect(await code(app.bills.suppliers(ece))).toBe("FORBIDDEN");
  });

  it("shows one supplier's bills and how their prices moved", async () => {
    await app.bills.add(murat, { key: key(), ...milk(10, 470) });
    const s = await app.bills.supplier(murat, "sup_seed_sut");
    expect(s.supplier).toMatchObject({ name: "Moda Süt", phone: "0532 410 22 18", removed: false });
    expect(s.bills.map((b) => b.date)).toEqual(["2026-10-16", "2026-10-10", "2026-09-30"]);
    expect(s.prices).toEqual([
      {
        itemId: "stk_sut",
        name: "Süt",
        unit: "l",
        points: [
          { date: "2026-10-16", unitKurus: 4_700, billId: expect.any(String) },
          { date: "2026-10-10", unitKurus: 4_500, billId: "bil_seed_sut2" },
          { date: "2026-09-30", unitKurus: 4_300, billId: "bil_seed_sut1" },
        ],
      },
    ]);
    expect(s.canSeeBills).toBe(true);
  });

  it("adds a supplier once per tap, tidies its numbers and keeps names unique", async () => {
    const input = {
      key: key(),
      name: "Manav Selim",
      phone: " 0532 111 22 33 ",
      iban: "tr33 0006 1005 1978 6457 8413 26",
      taxNo: "",
      email: "Selim@Manav.test",
    };
    const added = await app.bills.addSupplier(hakan, input);
    expect((await app.bills.addSupplier(hakan, input)).supplier.id).toBe(added.supplier.id);
    expect(added.supplier).toMatchObject({
      name: "Manav Selim",
      phone: "0532 111 22 33",
      iban: "TR330006100519786457841326",
      taxNo: null,
      email: "selim@manav.test",
    });
    expect(await code(app.bills.addSupplier(hakan, { key: key(), name: "manav selim" }))).toBe("SUPPLIER_EXISTS");
    expect(await code(app.bills.addSupplier(hakan, { key: key(), name: "Biri", iban: "TR12" }))).toBe("IBAN_INVALID");
    expect(await code(app.bills.addSupplier(hakan, { key: key(), name: "Biri", taxNo: "123" }))).toBe("TAX_NO_INVALID");
    expect(await code(app.bills.addSupplier(ece, { key: key(), name: "Biri" }))).toBe("FORBIDDEN");
  });

  it("removes a supplier from new bills but keeps it on old ones", async () => {
    const bill = await app.bills.add(murat, { key: key(), ...milk(2, 90) });
    const removed = await app.bills.updateSupplier(murat, "sup_seed_sut", { removed: true });
    expect(removed.supplier.removed).toBe(true);
    expect((await app.bills.list(murat)).suppliers.map((s) => s.id)).not.toContain("sup_seed_sut");
    expect((await app.bills.suppliers(murat)).removed.map((s) => s.name)).toEqual(["Moda Süt"]);
    expect(await code(app.bills.add(murat, { key: key(), ...milk(1, 45) }))).toBe("SUPPLIER_NOT_FOUND");
    // Its old bill still names it, and can still be corrected.
    expect((await app.bills.get(murat, bill.id)).supplierName).toBe("Moda Süt");
    expect(await code(app.bills.correct(murat, bill.id, { version: 1, ...milk(3, 135) }))).toBe("ok");
    await app.bills.updateSupplier(murat, "sup_seed_sut", { removed: false });
    expect((await app.bills.list(murat)).suppliers.map((s) => s.id)).toContain("sup_seed_sut");
  });

  it("puts what is owed on Bugün for those who see bills", async () => {
    expect((await app.staffDashboard(murat)).billsOwed).toEqual({ count: 3, totalKurus: 1_115_000, overdueCount: 1, overdueKurus: 385_000 });
    expect((await app.staffDashboard({ cafe: murat.cafe })).billsOwed).toBeNull();
  });
});
