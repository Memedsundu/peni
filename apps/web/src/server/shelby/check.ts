import { cashTotals, earned, localDateKey, plusDays, startOfLocalDay } from "@peni/core";
import type { PeniStores } from "../app";
import { defaultFrom, kurus, milliOf, mondayOf } from "./map";
import type { ShelbySnapshot } from "./source";

/**
 * The totals check (plan piece 33): the same numbers worked out from Shelby's records the
 * way Shelby means them, and from what Peni holds after the move, side by side. Shelby's
 * side reads the snapshot directly, not the mapping, so a mistake in the mapping shows.
 */

export type CheckUnit = "count" | "kurus" | "milli";

export interface CheckRow {
  group: string;
  label: string;
  unit: CheckUnit;
  shelby: number;
  peni: number;
  /** Rounding allowed (pay is worked out per day in Peni, per week in Shelby). */
  tolerance: number;
  ok: boolean;
}

type Side = Map<string, { group: string; label: string; unit: CheckUnit; value: number; tolerance?: number }>;

function put(side: Side, group: string, label: string, unit: CheckUnit, value: number, tolerance = 0): void {
  const key = `${group}\u0000${label}`;
  const had = side.get(key);
  side.set(key, { group, label, unit, value: (had?.value ?? 0) + value, tolerance: Math.max(had?.tolerance ?? 0, tolerance) });
}

const lower = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr");
const FAR = new Date("9999-01-01T00:00:00Z");
const ALL = 10_000_000;

/** What Shelby holds, for the records the move takes (from `from`, as the move did). */
export function shelbyTotals(snap: ShelbySnapshot, from: Date | null = defaultFrom(snap)): Side {
  const tz = snap.cafe.timezone || "Europe/Istanbul";
  const month = (d: Date) => localDateKey(d, tz).slice(0, 7);
  const kept = (d: Date | null | undefined) => !from || !d || d >= from;
  const side: Side = new Map();

  const orders = snap.orders.filter((o) => kept(o.createdAt));
  for (const s of ["paid", "voided", "refunded"]) put(side, "Orders", s, "count", orders.filter((o) => o.status === s).length);
  for (const o of orders) {
    if (o.status !== "paid" && o.status !== "refunded") continue;
    const method = o.paymentMethod === "card" ? "card" : "cash";
    put(side, "Sales less refunds", month(o.paidAt ?? o.createdAt), "kurus", kurus(o.total));
    put(side, "Sales less refunds", `by ${method}`, "kurus", kurus(o.total));
    if (o.status === "refunded") {
      const back = kurus(o.refundAmount ?? o.total);
      put(side, "Sales less refunds", month(o.refundedAt ?? o.updatedAt), "kurus", -back);
      put(side, "Sales less refunds", `by ${method}`, "kurus", -back);
    }
  }

  const expenses = snap.expenses.filter((e) => e.sourceType !== "timesheet_wages" && kept(e.date));
  const paidOf = new Map<number, number>();
  for (const p of snap.expensePayments) paidOf.set(p.expenseId, (paidOf.get(p.expenseId) ?? 0) + kurus(p.amount));
  for (const e of expenses) {
    put(side, "Bills", month(e.date), "kurus", kurus(e.amount));
    // Older bills were marked paid with no payment row.
    const paid = paidOf.get(e.id) ?? kurus(e.paidAmount);
    put(side, "Owed", "bills unpaid", "kurus", Math.max(0, kurus(e.amount) - paid));
  }
  const movedIds = new Set(expenses.map((e) => e.id));
  const payments = snap.expensePayments.filter((p) => movedIds.has(p.expenseId));
  const checks = snap.expenseChecks.filter((c) => movedIds.has(c.expenseId));
  put(
    side,
    "Owed",
    "checks not cashed",
    "kurus",
    checks.filter((c) => !c.isPaid).reduce((s, c) => s + kurus(c.amount), 0),
  );
  put(side, "Owed", "checks not cashed (count)", "count", checks.filter((c) => !c.isPaid).length);

  const userName = new Map(snap.users.map((u) => [u.id, u.name]));
  for (const p of payments) {
    if (p.method !== "borrowed_manager" && p.method !== "borrowed_other") continue;
    const e = snap.expenses.find((x) => x.id === p.expenseId)!;
    const userId = p.borrowedFromUserId ?? e.borrowedFromUserId;
    const name = (userId && userName.get(userId)) || p.borrowedFromName || e.borrowedFromName || "Bilinmiyor";
    put(side, "Owed", `loans from ${lower(name)}`, "kurus", kurus(p.amount));
  }
  for (const r of snap.debtRepayments.filter((x) => kept(x.paidAt))) {
    const name = (r.lenderUserId && userName.get(r.lenderUserId)) || r.lenderName || "Bilinmiyor";
    put(side, "Owed", `loans from ${lower(name)}`, "kurus", -kurus(r.amount));
  }
  const charged = payments.filter((p) => p.method === "shelby_card").reduce((s, p) => s + kurus(p.amount), 0);
  const cardPaid = snap.cardPayments.filter((p) => kept(p.paidAt)).reduce((s, p) => s + kurus(p.amount), 0);
  put(side, "Owed", "credit card", "kurus", charged - cardPaid);

  if (snap.cafe.moneyInitializedAt) {
    const balance = (kind: string) => kurus(snap.moneyAccounts.find((a) => a.kind === kind)?.balance ?? 0);
    put(side, "Money now", "drawer", "kurus", balance("drawer"));
    put(side, "Money now", "reserve", "kurus", balance("safe"));
    put(side, "Money now", "bank", "kurus", balance("bank"));
  }

  for (const s of snap.stockItems) put(side, "Stock now", s.name, "milli", Math.max(0, milliOf(s.currentStock, s.unit)));

  // Pay for the weeks moved, and what was paid against them.
  const fromDay = from ? localDateKey(from, tz) : null;
  const weekOf = new Map(snap.schedules.map((s) => [s.id, mondayOf(s.weekStart)]));
  const keptWeek = (scheduleId: number) => {
    const w = weekOf.get(scheduleId);
    return !!w && (!fromDay || plusDays(w, 6) >= fromDay);
  };
  const email = new Map(snap.users.map((u) => [u.id, u.email.trim().toLowerCase()]));
  const timesheets = snap.timesheets.filter((t) => keptWeek(t.scheduleId) && t.hoursWorked > 0);
  for (const t of timesheets) {
    // Peni pays each day to the kuruş: a kuruş a day, and a minute's pay a week, may round.
    put(side, "Pay earned", email.get(t.userId) ?? t.userId, "kurus", kurus(t.totalPay), 0);
  }
  const weeks = new Map<string, number>();
  const rate = new Map<string, number>();
  for (const t of timesheets) {
    const e = email.get(t.userId) ?? t.userId;
    weeks.set(e, (weeks.get(e) ?? 0) + 1);
    rate.set(e, Math.max(rate.get(e) ?? 0, kurus(t.hourlyRate)));
  }
  for (const [e, n] of weeks) put(side, "Pay earned", e, "kurus", 0, n * 7 + n * Math.ceil((rate.get(e) ?? 0) / 60));
  const sheetIds = new Set(timesheets.map((t) => t.id));
  const sheetUser = new Map(snap.timesheets.map((t) => [t.id, t.userId]));
  for (const p of snap.payrollPayouts.filter((x) => sheetIds.has(x.timesheetEntryId))) {
    put(side, "Pay paid out", email.get(sheetUser.get(p.timesheetEntryId)!) ?? "?", "kurus", kurus(p.amount));
  }

  put(side, "Counts", "team", "count", snap.users.length);
  put(side, "Counts", "menu items", "count", snap.products.length);
  put(side, "Counts", "suppliers", "count", snap.suppliers.length);
  put(side, "Counts", "stock items", "count", snap.stockItems.length);
  put(side, "Counts", "bills", "count", expenses.length);
  return side;
}

/** The same numbers from what Peni holds for the café. */
export async function peniTotals(stores: PeniStores, cafeId: string): Promise<Side> {
  const tz = (await stores.directory.getSettings(cafeId)).timeZone;
  const month = (d: Date) => localDateKey(d, tz).slice(0, 7);
  const side: Side = new Map();

  const orders = await stores.orders.listOrders(cafeId, { limit: ALL });
  for (const s of ["paid", "voided", "refunded"]) put(side, "Orders", s, "count", orders.filter((o) => o.status === s).length);
  const payments = (await stores.payments.listSettled(cafeId, new Date(0), FAR)).filter(
    (p) => p.status === "approved" && (p.method === "cash" || p.method === "card"),
  );
  for (const p of payments) {
    const sign = p.kind === "sale" ? 1 : -1;
    put(side, "Sales less refunds", month(p.settledAt!), "kurus", sign * p.amountKurus);
    put(side, "Sales less refunds", `by ${p.method}`, "kurus", sign * p.amountKurus);
  }

  const bills = (await stores.bills.listBills(cafeId, { limit: ALL })).filter((b) => !b.voidedAt);
  for (const b of bills) {
    put(side, "Bills", b.date.slice(0, 7), "kurus", b.totalKurus);
    put(side, "Owed", "bills unpaid", "kurus", Math.max(0, b.totalKurus - b.paidKurus));
  }
  const checks = (await stores.debts.listChecks(cafeId)).filter((c) => !c.cashedOn);
  put(
    side,
    "Owed",
    "checks not cashed",
    "kurus",
    checks.reduce((s, c) => s + c.amountKurus, 0),
  );
  put(side, "Owed", "checks not cashed (count)", "count", checks.length);
  const lenders = new Map<string, string>();
  for (const l of await stores.debts.listLoans(cafeId)) {
    lenders.set(l.lenderKey, l.lenderName);
    put(side, "Owed", `loans from ${lower(l.lenderName)}`, "kurus", l.amountKurus);
  }
  for (const r of await stores.debts.listRepayments(cafeId))
    put(side, "Owed", `loans from ${lower(lenders.get(r.lenderKey) ?? r.lenderKey.replace(/^name:/, ""))}`, "kurus", -r.amountKurus);
  const charged = (await stores.bills.listPayments(cafeId, { method: "credit" })).reduce((s, p) => s + p.amountKurus, 0);
  const cardPaid = (await stores.debts.listCardPayments(cafeId)).reduce((s, p) => s + p.amountKurus, 0);
  put(side, "Owed", "credit card", "kurus", charged - cardPaid);

  const start = await stores.books.getStart(cafeId);
  if (start) {
    const open = await stores.cash.openSession(cafeId);
    const drawer = open
      ? cashTotals(open, await stores.payments.listCashSessionPayments(cafeId, open.id), await stores.cash.listMoves(cafeId, open.id)).expectedKurus
      : ((await stores.cash.lastClosed(cafeId))?.closing?.countKurus ?? 0);
    const totals = await stores.books.totals(cafeId);
    const since = startOfLocalDay(new Date(`${start.startedOn}T12:00:00Z`), tz);
    const cardNet = payments
      .filter((p) => p.method === "card" && p.settledAt! >= since)
      .reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0);
    put(side, "Money now", "drawer", "kurus", drawer);
    put(side, "Money now", "reserve", "kurus", totals.reserve);
    put(side, "Money now", "bank", "kurus", totals.bank + cardNet);
  }

  const items = await stores.stock.listItems(cafeId, { includeArchived: true });
  for (const s of items) put(side, "Stock now", s.name, "milli", s.qtyMilli);

  const members = await stores.staff.listMembers(cafeId);
  const email = new Map<string, string>();
  for (const m of members) email.set(m.id, (await stores.staff.getAccount(m.accountId))?.email ?? m.id);
  const days = await stores.shifts.listWorkDays(cafeId, "0000-01-01", "9999-12-31");
  for (const [memberId, e] of earned(days, await stores.shifts.listRates(cafeId))) put(side, "Pay earned", email.get(memberId) ?? memberId, "kurus", e.kurus);
  for (const p of await stores.shifts.listPayouts(cafeId)) put(side, "Pay paid out", email.get(p.memberId) ?? p.memberId, "kurus", p.amountKurus);

  put(side, "Counts", "team", "count", members.length);
  put(side, "Counts", "menu items", "count", (await stores.menu.listMenu(cafeId, { includeArchived: true })).length);
  put(side, "Counts", "suppliers", "count", (await stores.bills.listSuppliers(cafeId, { includeArchived: true })).length);
  put(side, "Counts", "stock items", "count", items.length);
  put(side, "Counts", "bills", "count", bills.length);
  return side;
}

/** Every number on either side, with whether they agree. */
export function compareTotals(shelby: Side, peni: Side): CheckRow[] {
  const keys = [...new Set([...shelby.keys(), ...peni.keys()])];
  const rows = keys.map((k) => {
    const a = shelby.get(k);
    const b = peni.get(k);
    const base = (a ?? b)!;
    const tolerance = Math.max(a?.tolerance ?? 0, b?.tolerance ?? 0);
    const s = a?.value ?? 0;
    const p = b?.value ?? 0;
    return { group: base.group, label: base.label, unit: base.unit, shelby: s, peni: p, tolerance, ok: Math.abs(s - p) <= tolerance };
  });
  const order = ["Orders", "Sales less refunds", "Bills", "Owed", "Money now", "Stock now", "Pay earned", "Pay paid out", "Counts"];
  return rows.sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group) || x.label.localeCompare(y.label));
}

export async function checkMove(snap: ShelbySnapshot, stores: PeniStores, cafeId: string, from: Date | null = defaultFrom(snap)): Promise<CheckRow[]> {
  return compareTotals(shelbyTotals(snap, from), await peniTotals(stores, cafeId));
}
