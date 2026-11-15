import type { CashMove } from "@peni/core";
import type { PeniStores } from "../app";
import type { PeniRecords } from "./map";

/**
 * Runs `fn` over `items` one after the other. The move is one transaction on one connection
 * (and a store's own nested transaction can't run beside another), so nothing runs at once.
 */
async function each<T>(items: readonly T[], fn: (item: T) => Promise<unknown>): Promise<void> {
  for (const item of items) await fn(item);
}

export interface WriteOptions {
  progress?: (step: string) => void;
  /**
   * When Penny already has the café: delete it and everything in it, then move again (N13).
   * Its staff accounts go too, unless they also work at another café.
   */
  replace?: boolean;
  /** With `replace`: delete even what was made in Penny itself (see `pennyMade`). */
  discardPennyRecords?: boolean;
}

/** `--replace` found records made in Penny, which a fresh move would delete. */
export class PennyRecordsError extends Error {
  constructor(
    readonly cafe: string,
    readonly records: { what: string; count: number }[],
  ) {
    super(
      [
        `Penny's ${cafe} has records that weren't moved from Shelby:`,
        ...records.map((r) => `  - ${r.what}: ${r.count}`),
        "Replacing the café would delete them. Add --discard-penny-records to delete them anyway.",
      ].join("\n"),
    );
  }
}

/** Long enough for a café's move over the internet in one transaction. */
const MOVE_TIMEOUT_MS = 30 * 60_000;

/**
 * Saves the moved records into Peni (plan piece 33). Into a café with nothing in it yet,
 * or with `replace` in place of the café as it is (the preview copy, N13). Either way in
 * one transaction in Postgres: a move that fails part way leaves Penny as it was.
 * Staff who already have a Peni account (same email) keep it and join the café.
 */
export async function writeShelby(stores: PeniStores, r: PeniRecords, opts: WriteOptions = {}): Promise<void> {
  const progress = opts.progress ?? (() => {});
  const cafeId = r.cafe.id;
  await stores.ledger.atomically(
    async () => {
      const there = (await stores.identity.getCafe(cafeId)) ?? (await stores.identity.getCafeBySlug(r.cafe.slug));
      if (there && there.id !== cafeId) throw new Error(`Penny's café at ${r.cafe.slug} is "${there.name}" (${there.id}), not the one Shelby moves into (${cafeId})`);
      if (there && opts.replace) {
        const made = await pennyMade(stores, cafeId);
        if (made.length && !opts.discardPennyRecords) throw new PennyRecordsError(`${there.name} (${there.slug})`, made);
        const peni = made.find((m) => m.what === "peni movements");
        if (peni) {
          throw new Error(
            `Penny's ${there.name} (${there.slug}) has ${peni.count} peni movement(s): customers' pennies or the askı. The peni ledger is never deleted, so this café can't be replaced.`,
          );
        }
        progress("removing the café as it is");
        const gone = await stores.removal.removeCafe(cafeId);
        progress(`  ${gone.accountsRemoved} staff account(s) with it, ${gone.accountsKept} kept (they work at another café too)`);
      } else if (there) {
        const busy = (await stores.orders.listOrders(cafeId, { limit: 1 })).length + (await stores.bills.listBills(cafeId)).length;
        if (busy) throw new Error(`Penny already has the café "${there.name}" (${there.slug}) with records in it; move into an empty one, or add --replace`);
      }
      await save(stores, r, progress);
    },
    { timeoutMs: MOVE_TIMEOUT_MS },
  );
}

async function save(stores: PeniStores, r: PeniRecords, progress: (step: string) => void): Promise<void> {
  const cafeId = r.cafe.id;
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
  for (const m of r.cashMoves) if (!(await stores.cash.saveMove(m))) throw new Error(`Couldn't save Kasa move ${m.id}`);
  await stores.orders.addOrders(r.orders);
  await stores.payments.addPayments(r.payments);

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

const ALL = 10_000_000;
const EVER = ["0000-01-01", "9999-12-31"] as const;
/** Every record the move writes has an id starting with `shelby_` (map.ts); Penny's own never do. */
const madeInPenny = (id: string) => !id.startsWith("shelby_");

/**
 * What people did in the café in Penny rather than in Shelby, which replacing it would
 * delete (N13): records whose id isn't one the move gives, and moved records changed
 * after the move where the record keeps when it changed. Kinds with nothing are left out.
 * Not seen: changes to moved records that keep no time (a menu item's price, a stock
 * item, a supplier, a person's role, PIN or password), the café's settings and page,
 * and the assistant's own work (drafts it read, letters, Gözcü). Peni movements are
 * listed, but even --discard-penny-records can't delete them (the ledger is append-only).
 */
export async function pennyMade(stores: PeniStores, cafeId: string): Promise<{ what: string; count: number }[]> {
  const since = (await stores.stock.listBatch(cafeId, "shelby:start"))[0]?.at ?? (await stores.books.getStart(cafeId))?.createdAt ?? null;
  const changed = (d: Date) => !!since && d > since;
  const made = <T>(rows: T[], id: (x: T) => string) => rows.filter((x) => madeInPenny(id(x))).length;

  const orders = await stores.orders.listOrders(cafeId, { limit: ALL });
  const payments = orders.length ? await stores.payments.listPayments(cafeId, orders.map((o) => o.id)) : [];
  const sessions = await stores.cash.listSessions(cafeId, ALL);
  const cashMoves: CashMove[] = [];
  for (const s of sessions) cashMoves.push(...(await stores.cash.listMoves(cafeId, s.id)));
  const bills = await stores.bills.listBills(cafeId, { includeVoided: true, limit: ALL });
  const shifts = await stores.shifts.listShifts(cafeId, ...EVER);
  const workDays = await stores.shifts.listWorkDays(cafeId, ...EVER);
  const taskLists = await stores.tasks.listLists(cafeId, { includeArchived: true });
  const taskChecks = await stores.tasks.listChecks(cafeId, ...EVER);

  const counts: [string, number][] = [
    ["till orders", made(orders, (o) => o.id)],
    ["till payments and refunds", made(payments, (p) => p.id)],
    ["Kasa sessions", made(sessions, (s) => s.id)],
    ["cash put in or taken out at the Kasa", made(cashMoves, (m) => m.id)],
    ["bills", made(bills, (b) => b.id)],
    ["moved bills changed or voided", bills.filter((b) => !madeInPenny(b.id) && (!!b.voidedById || changed(b.updatedAt))).length],
    ["bill payments", made(await stores.bills.listPayments(cafeId), (p) => p.id)],
    ["suppliers", made(await stores.bills.listSuppliers(cafeId, { includeArchived: true }), (s) => s.id)],
    ["checks", made(await stores.debts.listChecks(cafeId), (c) => c.id)],
    ["loans", made(await stores.debts.listLoans(cafeId), (l) => l.id)],
    ["loan repayments", made(await stores.debts.listRepayments(cafeId), (x) => x.id)],
    ["credit card payments", made(await stores.debts.listCardPayments(cafeId), (p) => p.id)],
    ["Nakit ve banka movements", made(await stores.books.listMovements(cafeId), (m) => m.id)],
    ["month closes", (await stores.books.listCloses(cafeId)).length],
    ["menu items", made(await stores.menu.listMenu(cafeId, { includeArchived: true }), (p) => p.productId)],
    ["menu categories", made(await stores.menu.listCategories(cafeId), (c) => c.id)],
    ["stock items", made(await stores.stock.listItems(cafeId, { includeArchived: true }), (s) => s.id)],
    ["stock counts, waste and other stock changes", made(await stores.stock.listMoves(cafeId, { limit: ALL }), (m) => m.id)],
    ["people added to the team", made(await stores.staff.listMembers(cafeId), (m) => m.id)],
    ["role permission changes", (await stores.staff.listOverrides(cafeId)).length],
    ["till computers", (await stores.staff.listDevices(cafeId)).length],
    ["shifts", made(shifts, (s) => s.id)],
    ["moved shifts changed", shifts.filter((s) => !madeInPenny(s.id) && changed(s.updatedAt)).length],
    ["days worked entered or changed", workDays.filter((w) => changed(w.updatedAt)).length],
    ["pay rates", made(await stores.shifts.listRates(cafeId), (x) => x.id)],
    ["payouts", made(await stores.shifts.listPayouts(cafeId), (p) => p.id)],
    ["pay month closes", (await stores.shifts.listPayCloses(cafeId)).length],
    ["task lists", made(taskLists, (l) => l.id)],
    ["moved task lists changed", taskLists.filter((l) => !madeInPenny(l.id) && changed(l.updatedAt)).length],
    ["tasks", made(await stores.tasks.listItems(cafeId), (i) => i.id)],
    ["tasks ticked", taskChecks.filter((c) => changed(c.at)).length],
    ["posts and events", (await stores.community.listPosts(cafeId, { hiddenPosts: true })).length],
    ["customers who joined", (await stores.directory.listMemberships({ cafeId })).length],
    ["peni movements", (await stores.ledger.query({ cafeId })).length],
    ["gifts", (await stores.directory.listGifts({ cafeId })).length],
    ["yazarkasa bridges", (await stores.terminals.listBridges(cafeId)).length],
  ];
  return counts.filter(([, count]) => count > 0).map(([what, count]) => ({ what, count }));
}
