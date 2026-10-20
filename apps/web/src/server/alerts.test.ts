import { beforeEach, describe, expect, it } from "vitest";
import { inMemoryStores, PeniApp } from "./app";
import { DEMO_STAFF, DEMO_STAFF_PASSWORD, seed } from "./seed";
import type { StaffContext } from "./staff";

let app: PeniApp;
let now: Date;
let leyla: StaffContext;
let hakan: StaffContext;
let ece: StaffContext;

const at = async (who: keyof typeof DEMO_STAFF, slug = "moda") =>
  app.staff.at((await app.staff.signIn(DEMO_STAFF[who].email, DEMO_STAFF_PASSWORD)).token, slug);

beforeEach(async () => {
  // Friday 16 October, 12:00 in Istanbul.
  now = new Date("2026-10-16T09:00:00Z");
  app = new PeniApp({ demo: true, bcryptRounds: 4, clock: () => now }, inMemoryStores());
  await seed(app, { sales: false, drafts: false });
  [leyla, hakan, ece] = await Promise.all([at("leyla"), at("hakan"), at("ece")]);
});

describe("Bugün's setup checklist", () => {
  it("on Moda asks about the five stock items no bill has brought; every product there has a recipe", async () => {
    expect((await app.alerts.today(leyla)).setup).toEqual({
      noRecipe: null,
      unstocked: null,
      neverBought: { count: 5, names: ["Dökme çay", "Limon", "Lokum", "San Sebastian dilimi", "Taze nane"] },
      notCounted: null,
    });
    // The chef manages stock and recipes too; a barista does neither and sees no checklist.
    expect((await app.alerts.today(hakan)).setup?.neverBought?.count).toBe(5);
    expect((await app.alerts.today(ece)).setup).toBeNull();
    // Kuzguncuk hasn't written any recipes yet.
    expect((await app.alerts.today(await at("tarik", "kuzguncuk"))).setup?.noRecipe).toEqual({
      count: 4,
      total: 4,
      names: ["Çay", "Türk Kahvesi", "Salep", "Peynirli Poğaça"],
    });
  });

  it("lists a bill line that looked like stock and reached none, with a link to its bill, until it's linked", async () => {
    const bill = await app.bills.add(leyla, {
      key: "b1",
      supplierId: "sup_seed_sut",
      date: "2026-10-15",
      lines: [
        { itemId: null, name: "Laktozsuz Süt 1 L", category: "ingredients", totalKurus: 90_000 },
        { itemId: null, name: "Nakliye", category: "services", totalKurus: 5_000 },
      ],
    });
    expect((await app.alerts.today(leyla)).setup?.unstocked).toEqual({
      count: 1,
      bills: [{ id: bill.id, supplierName: "Moda Süt", date: "2026-10-15", lines: ["Laktozsuz Süt 1 L"] }],
    });
    await app.bills.correct(leyla, bill.id, {
      version: 1,
      supplierId: "sup_seed_sut",
      date: "2026-10-15",
      lines: [
        { itemId: "stk_sut", qtyMilli: 24_000, totalKurus: 90_000 },
        { itemId: null, name: "Nakliye", category: "services", totalKurus: 5_000 },
      ],
    });
    expect((await app.alerts.today(leyla)).setup?.unstocked).toBeNull();
  });

  it("asks for a count once recipe items go 30 days without one, and is gone when everything is in order", async () => {
    // 17 days on: the starting amounts are 31 days old; espresso, milk, simit and cheesecake were counted 24 days ago.
    now = new Date("2026-11-02T09:00:00Z");
    expect((await app.alerts.today(leyla)).setup?.notCounted).toEqual({
      count: 6,
      names: ["Dökme çay", "Filtre kahve çekirdeği", "Limon", "Lokum", "Taze nane"],
    });

    await app.stock.count(leyla, {
      key: "c1",
      counts: ["stk_cay", "stk_filtre", "stk_limon", "stk_lokum", "stk_nane", "stk_turk"].map((itemId) => ({ itemId, countedMilli: 1_000 })),
    });
    for (const [i, itemId] of ["stk_cay", "stk_limon", "stk_lokum", "stk_sansebastian", "stk_nane"].entries())
      await app.bills.add(leyla, { key: `buy${i}`, supplierId: null, date: "2026-11-01", lines: [{ itemId, qtyMilli: 1_000, totalKurus: 10_000 }] });
    expect((await app.alerts.today(leyla)).setup).toBeNull();
  });
});
