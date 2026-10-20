import type { PeniStores } from "../app";
import type { PeniRecords } from "./map";

/** Runs `fn` over `items`, `n` at a time: a few thousand orders shouldn't take one round trip each in a row. */
async function each<T>(items: readonly T[], fn: (item: T) => Promise<unknown>, n = 8): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

/**
 * Saves the moved records into Peni (plan piece 33). Only into a café with nothing in it
 * yet: the move is rehearsed on a copy as often as needed, and run once for real.
 * Staff who already have a Peni account (same email) keep it and join the café.
 */
export async function writeShelby(stores: PeniStores, r: PeniRecords, progress: (step: string) => void = () => {}): Promise<void> {
  const cafeId = r.cafe.id;
  const there = (await stores.identity.getCafe(cafeId)) ?? (await stores.identity.getCafeBySlug(r.cafe.slug));
  if (there) {
    const busy = (await stores.orders.listOrders(there.id, { limit: 1 })).length + (await stores.bills.listBills(there.id)).length;
    if (there.id !== cafeId || busy) throw new Error(`Penny already has the café "${there.name}" (${there.slug}) with records in it; move into an empty one`);
  }

  progress("café and team");
  await stores.identity.saveCafe(r.cafe);
  await stores.directory.saveSettings(r.settings);
  const accountId = new Map<string, string>();
  for (const a of r.accounts) {
    const had = await stores.staff.getAccountByEmail(a.email);
    if (had) accountId.set(a.id, had.id);
    else await stores.staff.saveAccount(a);
  }
  for (const m of r.members) await stores.staff.saveMember({ ...m, accountId: accountId.get(m.accountId) ?? m.accountId });

  progress("menu and stock");
  for (const c of r.categories) await stores.menu.saveCategory(c);
  await each(r.products, (p) => stores.menu.saveProduct(cafeId, p));
  await each(r.stockItems, (s) => stores.stock.saveItem(s));
  if (r.stockStart) await stores.stock.applyBatch(r.stockStart);
  await each(r.recipes, (x) => stores.stock.saveRecipe(x));

  progress(`kasa sessions, ${r.orders.length} orders`);
  for (const s of r.cashSessions) if (!(await stores.cash.saveSession(s))) throw new Error(`Couldn't save Kasa session ${s.id}`);
  await each(r.orders, (o) => stores.orders.saveOrder(o));
  await each(r.payments, async (p) => {
    if (!(await stores.payments.savePayment(p))) throw new Error(`Couldn't save payment ${p.id}`);
  });

  progress(`${r.bills.length} bills and what's owed`);
  await each(r.suppliers, (s) => stores.bills.saveSupplier(s));
  await each(r.bills, (b) => stores.bills.saveBill(b));
  await each(r.billPayments, (p) => stores.bills.addPayment(p));
  await each(r.checks, (c) => stores.debts.saveCheck(c));
  await each(r.loans, (l) => stores.debts.saveLoan(l));
  await each(r.repayments, (x) => stores.debts.addRepayment(x));
  if (r.card) await stores.debts.saveCard(r.card);
  await each(r.cardPayments, (p) => stores.debts.addCardPayment(p));
  if (r.moneyStart) {
    await stores.books.saveStart(r.moneyStart);
    await stores.books.addMovements(r.movements);
  }

  progress("shifts, hours and pay");
  await stores.shifts.addShifts(r.shifts);
  for (const w of r.weeks) await stores.shifts.saveWeek(w);
  for (let i = 0; i < r.workDays.length; i += 500) await stores.shifts.setWorkDays(cafeId, r.workDays.slice(i, i + 500), []);
  for (const x of r.rates) await stores.shifts.saveRate(x);
  await each(r.payouts, (p) => stores.shifts.addPayout(p));

  progress("tasks");
  for (const l of r.taskLists) await stores.tasks.saveList(l);
  if (r.taskItems.length) await stores.tasks.saveItems(r.taskItems);
  await each(r.taskChecks, (c) => stores.tasks.saveCheck(c));
}
