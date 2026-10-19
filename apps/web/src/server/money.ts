import type { CashFromDTO, MoneyAccountDTO, MoneyDTO, MoneyLineDTO, MonthCloseDTO, MonthsDTO } from "@peni/api";
import {
  addDays,
  addMonths,
  cashTotals,
  closedThrough,
  localDateKey,
  loansLeft,
  monthDays,
  nextMonthToClose,
  owedByMonth,
  dayPay,
  rateOn,
  standingCloses,
  startOfLocalDay,
  validMonth,
  type BillStore,
  type BooksStore,
  type CashMove,
  type CashSession,
  type CashStore,
  type DebtStore,
  type KeptAccount,
  type MoneyAccount,
  type MoneyMovement,
  type MonthClose,
  type MonthSummary,
  type MovementKind,
  type Payment,
  type PaymentStore,
  type PeniDirectory,
  type Permission,
  type ShiftStore,
  type StaffStore,
  type StatementRecord,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { keyHash } from "./bills";
import { AppError } from "./errors";
import type { StaffContext } from "./staff";

/** Nakit ve banka shows this many days back. */
const LINE_DAYS = 60;
/** Drawer sessions looked through for its lines and for a month's last count. */
const SESSIONS = 400;
const MONEY_MAX_KURUS = 1_000_000_000;
const NOTE_MAX = 200;

/** What a manual transfer's drawer side says at Kasa when no note was written. */
const DRAWER_REASON: Record<string, string> = {
  "out:reserve": "Ayrı kasaya konuldu",
  "out:bank": "Bankaya yatırıldı",
  "in:reserve": "Ayrı kasadan alındı",
  "in:bank": "Bankadan çekildi",
};

/** A payment elsewhere that moves money: what it was, where from, and when. */
export interface Posting {
  /** "bill_payment:<id>", "check:<id>", "repayment:<id>", "card_payment:<id>", "pay:<id>". */
  source: string;
  account: MoneyAccount | null;
  /** In is positive, out negative. */
  amountKurus: number;
  kind: MovementKind;
  day: string;
  /** Shown at Kasa when it comes out of the drawer: "Fatura · Süt Dünyası". */
  label: string;
  counterpart?: MoneyAccount | null;
}

type MoveInput = {
  key: string;
  kind: "transfer" | "deposit" | "withdraw" | "correction";
  account: MoneyAccount;
  to?: MoneyAccount;
  amountKurus: number;
  note?: string;
};

/**
 * Nakit ve banka and Ay kapanışı (plan piece 20). The drawer is what its Kasa session
 * says; the reserve and the bank are their movements, plus the bank's card sales. Bill,
 * check, repayment and card payments elsewhere call `post` and `unpost` inside their own
 * transaction, and `assertOpen` before writing anything dated.
 */
export class MoneyService {
  constructor(
    private readonly store: BooksStore,
    private readonly cash: CashStore,
    private readonly payments: PaymentStore,
    private readonly bills: BillStore,
    private readonly debts: DebtStore,
    private readonly shifts: ShiftStore,
    private readonly directory: PeniDirectory,
    private readonly staff: StaffStore,
    private readonly atomically: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly now: () => Date,
  ) {}

  // ─────────────────────────────────────────────── for other services

  /** Refuses when any of these days is in a closed month. */
  async assertOpen(cafeId: string, ...days: (string | null | undefined)[]): Promise<void> {
    const through = await this.closedThrough(cafeId);
    if (through && days.some((d) => !!d && d <= through)) throw new AppError("PERIOD_CLOSED", "That month is closed", 409);
  }

  async closedThrough(cafeId: string): Promise<string | null> {
    return closedThrough(await this.store.listCloses(cafeId));
  }

  /** What a pay form offers for cash; null before the café started (cash isn't followed). */
  async cashFrom(cafeId: string, permissions: ReadonlySet<Permission>): Promise<CashFromDTO | null> {
    if (!(await this.store.getStart(cafeId))) return null;
    return { drawerOpen: !!(await this.cash.openSession(cafeId)), reserve: permissions.has("cash.manage") };
  }

  /**
   * Which account a payment by `method` on `day` comes out of: the bank for card and
   * transfer, the drawer or the reserve for cash (the drawer when it's open, unless the
   * payer picks). Null when nothing moves: credit, checks and loans, before the café
   * started, or a payment dated before the start (the opening amounts already had it).
   */
  async accountFor(ctx: StaffContext, method: string, from: "drawer" | "reserve" | undefined, day: string): Promise<MoneyAccount | null> {
    const start = await this.store.getStart(ctx.cafe.id);
    if (!start || day < start.startedOn) return null;
    if (method === "card" || method === "bank") return "bank";
    if (method !== "cash") return null;
    const pick = from ?? ((await this.cash.openSession(ctx.cafe.id)) ? "drawer" : "reserve");
    if (pick === "reserve") this.require(ctx, "cash.manage");
    return pick;
  }

  /** Moves the money for a payment. Call inside the caller's transaction. */
  async post(ctx: StaffContext, p: Posting): Promise<void> {
    if (!p.account || p.amountKurus === 0) return;
    const cafeId = ctx.cafe.id;
    if (p.account === "drawer") {
      const session = await this.cash.openSession(cafeId);
      if (!session) throw new AppError("CASH_CLOSED", "Open the drawer first, or pay from the reserve", 409);
      if (p.amountKurus < 0 && -p.amountKurus > (await this.drawerExpected(session)))
        throw new AppError("CASH_TOO_LOW", "There isn't that much in the drawer", 409);
      await this.cash.saveMove(this.drawerMove(ctx, session, `src:${p.source}`, p.amountKurus, p.label));
      return;
    }
    if (p.account === "reserve") this.require(ctx, "cash.manage");
    if (p.account === "reserve" && p.amountKurus < 0 && -p.amountKurus > (await this.store.totals(cafeId)).reserve) {
      throw new AppError("RESERVE_TOO_LOW", "There isn't that much in the reserve", 409);
    }
    await this.store.addMovements([this.movement(ctx, p.account, p.amountKurus, p.kind, p.source, p.day, null, p.counterpart ?? null)]);
  }

  /**
   * Takes a payment's money movement away when the payment is undone. Out of the drawer:
   * the move goes if its drawer day is still open; otherwise the money is put back into
   * today's drawer, since the closed day's count already had it. Call inside a transaction.
   */
  async unpost(ctx: StaffContext, source: string, label: string): Promise<void> {
    const cafeId = ctx.cafe.id;
    const kept = await this.store.listBySource(cafeId, source);
    if (kept.some((m) => m.account === "reserve")) this.require(ctx, "cash.manage");
    for (const m of kept) {
      if (m.account === "reserve" && m.amountKurus > 0 && m.amountKurus > (await this.store.totals(cafeId)).reserve) {
        throw new AppError("RESERVE_TOO_LOW", "There isn't that much in the reserve", 409);
      }
    }
    await this.store.removeBySource(cafeId, source);
    const move = await this.cash.findMoveByKey(cafeId, `src:${source}`);
    if (!move) return;
    const session = await this.cash.getSession(cafeId, move.sessionId);
    if (session && !session.closing) {
      await this.cash.removeMove(cafeId, move.id);
      return;
    }
    if (await this.cash.findMoveByKey(cafeId, `src:${source}:undo`)) return;
    const open = await this.cash.openSession(cafeId);
    if (!open) throw new AppError("CASH_CLOSED_UNDO", "Open the drawer to put it back", 409);
    const back = move.kind === "out" ? move.amountKurus : -move.amountKurus;
    if (back < 0 && -back > (await this.drawerExpected(open))) throw new AppError("CASH_TOO_LOW", "There isn't that much in the drawer", 409);
    await this.cash.saveMove(this.drawerMove(ctx, open, `src:${source}:undo`, back, `Geri alındı · ${label}`));
  }

  // ─────────────────────────────────────────────── Nakit ve banka

  async get(ctx: StaffContext): Promise<MoneyDTO> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    const [today, start, open, last, closes] = await Promise.all([
      this.today(cafeId),
      this.store.getStart(cafeId),
      this.cash.openSession(cafeId),
      this.cash.lastClosed(cafeId),
      this.store.listCloses(cafeId),
    ]);
    const through = closedThrough(closes);
    const drawerKurus = open ? await this.drawerExpected(open) : (last?.closing?.countKurus ?? null);
    let reserveKurus: number | null = null;
    let bankKurus: number | null = null;
    let lines: MoneyLineDTO[] = [];
    if (start) {
      const totals = await this.store.totals(cafeId);
      reserveKurus = totals.reserve;
      bankKurus = totals.bank + (await this.cardNet(cafeId, start.startedOn, this.justAfterNow()));
      const since = [start.startedOn, this.daysBefore(today, LINE_DAYS)].sort().at(-1)!;
      lines = await this.lines(cafeId, since, through);
    }
    const startedBy = start ? ((await this.names([start.memberId])).get(start.memberId) ?? null) : null;
    return {
      today,
      started: start ? { on: start.startedOn, by: startedBy } : null,
      drawer: { balanceKurus: drawerKurus, open: !!open, sessionId: open?.id ?? null },
      reserveKurus,
      bankKurus,
      totalKurus: start ? (drawerKurus ?? 0) + reserveKurus! + bankKurus! : null,
      lines,
      closedThrough: through,
      canManage: true,
      canClose: ctx.permissions.has("cash.periods"),
    };
  }

  /** Drawer, reserve and bank together now, as Nakit ve banka shows them; null before "Başla". */
  async totalOf(cafeId: string): Promise<number | null> {
    const [start, open, last] = await Promise.all([this.store.getStart(cafeId), this.cash.openSession(cafeId), this.cash.lastClosed(cafeId)]);
    if (!start) return null;
    const drawer = open ? await this.drawerExpected(open) : (last?.closing?.countKurus ?? 0);
    const totals = await this.store.totals(cafeId);
    return drawer + totals.reserve + totals.bank + (await this.cardNet(cafeId, start.startedOn, this.justAfterNow()));
  }

  /** "Başla": what the reserve and the bank hold today. The drawer's own count is its Kasa count. */
  async start(ctx: StaffContext, input: { reserveKurus: number; bankKurus: number }): Promise<MoneyDTO> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    if (!Number.isInteger(input.reserveKurus) || input.reserveKurus < 0 || input.reserveKurus > MONEY_MAX_KURUS)
      throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    if (!Number.isInteger(input.bankKurus) || Math.abs(input.bankKurus) > MONEY_MAX_KURUS) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    const today = await this.today(cafeId);
    await this.assertOpen(cafeId, today);
    await this.atomically(async () => {
      if (!(await this.store.saveStart({ cafeId, startedOn: today, memberId: ctx.member.id, createdAt: this.now() }))) {
        throw new AppError("MONEY_STARTED", "The opening amounts are already in", 409);
      }
      await this.store.addMovements([
        this.movement(ctx, "reserve", input.reserveKurus, "opening", "opening", today, null, null),
        this.movement(ctx, "bank", input.bankKurus, "opening", "opening", today, null, null),
      ]);
    });
    return this.get(ctx);
  }

  /** "Aktar", "Para koy", "Para çek", "Düzelt". The same `key` twice moves once. */
  async move(ctx: StaffContext, input: MoveInput): Promise<MoneyDTO> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    const source = `manual:${keyHash(cafeId, input.key)}`;
    const note = this.note(input.note);
    if (!["drawer", "reserve", "bank"].includes(input.account)) throw new AppError("ACCOUNT_INVALID", "Check the account", 400);
    if (!Number.isInteger(input.amountKurus) || input.amountKurus < (input.kind === "correction" ? 0 : 1) || input.amountKurus > MONEY_MAX_KURUS) {
      throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    }
    if (input.kind !== "transfer" && input.account === "drawer") throw new AppError("ACCOUNT_INVALID", "Use Kasa for the drawer", 400);
    if (input.kind !== "transfer" && !note) throw new AppError("NOTE_REQUIRED", "Write what it was for", 400);
    const today = await this.today(cafeId);
    await this.atomically(async () => {
      if ((await this.store.listBySource(cafeId, source)).length || (await this.cash.findMoveByKey(cafeId, `src:${source}`))) return;
      const start = await this.store.getStart(cafeId);
      if (!start) throw new AppError("MONEY_NOT_STARTED", "Enter the opening amounts first", 409);
      const totals = await this.store.totals(cafeId);
      const balance = async (a: KeptAccount) => totals[a] + (a === "bank" ? await this.cardNet(cafeId, start.startedOn, this.justAfterNow()) : 0);
      if (input.kind === "transfer") {
        const to = input.to;
        if (!to || !["drawer", "reserve", "bank"].includes(to)) throw new AppError("ACCOUNT_INVALID", "Pick where it goes", 400);
        if (to === input.account) throw new AppError("SAME_ACCOUNT", "Pick another account", 400);
        if (input.account === "bank" && input.amountKurus > (await balance("bank"))) throw new AppError("BANK_TOO_LOW", "The bank doesn't show that much", 409);
        const reason = (dir: "in" | "out", other: MoneyAccount) => note ?? DRAWER_REASON[`${dir}:${other}`]!;
        await this.side(ctx, input.account, -input.amountKurus, source, today, note, to, reason("out", to));
        await this.side(ctx, to, input.amountKurus, source, today, note, input.account, reason("in", input.account));
        return;
      }
      const account = input.account as KeptAccount;
      const now = await balance(account);
      let delta = input.amountKurus;
      if (input.kind === "withdraw") {
        if (input.amountKurus > now) throw new AppError(account === "bank" ? "BANK_TOO_LOW" : "RESERVE_TOO_LOW", "There isn't that much there", 409);
        delta = -input.amountKurus;
      }
      if (input.kind === "correction") {
        delta = input.amountKurus - now;
        if (delta === 0) throw new AppError("SAME_BALANCE", "It already holds that much", 409);
      }
      await this.store.addMovements([this.movement(ctx, account, delta, input.kind, source, today, note, null)]);
    });
    return this.get(ctx);
  }

  /** "Geri al" on a transfer, deposit, withdrawal or correction made here. */
  async undo(ctx: StaffContext, undoId: string): Promise<MoneyDTO> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    const source = `manual:${undoId}`;
    await this.atomically(async () => {
      const kept = await this.store.listBySource(cafeId, source);
      const move = await this.cash.findMoveByKey(cafeId, `src:${source}`);
      if (!kept.length && !move) throw new AppError("MOVE_NOT_FOUND", "No such movement", 404);
      const tz = await this.timeZone(cafeId);
      await this.assertOpen(cafeId, ...kept.map((m) => m.day), move ? localDateKey(move.at, tz) : null);
      if (move) {
        const session = await this.cash.getSession(cafeId, move.sessionId);
        if (!session || session.closing) throw new AppError("MOVE_LOCKED", "That drawer day is closed", 409);
        if (move.kind === "in" && move.amountKurus > (await this.drawerExpected(session)))
          throw new AppError("CASH_TOO_LOW", "There isn't that much in the drawer", 409);
      }
      for (const m of kept) {
        if (m.account === "reserve" && m.amountKurus > 0 && m.amountKurus > (await this.store.totals(cafeId)).reserve) {
          throw new AppError("RESERVE_TOO_LOW", "There isn't that much in the reserve", 409);
        }
      }
      await this.store.removeBySource(cafeId, source);
      if (move) await this.cash.removeMove(cafeId, move.id);
    });
    return this.get(ctx);
  }

  // ─────────────────────────────────────────────── statements (piece 27)

  /**
   * The bank's side of Nakit ve banka between two days, as a statement shows it: each
   * payment and movement, and each day's card sales. Null before the café started keeping
   * its money here.
   */
  async bankRecords(cafeId: string, from: string, to: string): Promise<StatementRecord[] | null> {
    const start = await this.store.getStart(cafeId);
    if (!start || to < start.startedOn) return null;
    const lines = await this.lines(cafeId, [start.startedOn, from].sort().at(-1)!, await this.closedThrough(cafeId));
    return lines
      .filter((l) => l.account === "bank" && l.kind !== "opening" && l.kind !== "correction" && l.day <= to && l.amountKurus !== 0)
      .map((l) => ({ id: l.id, day: l.day, amountKurus: l.amountKurus, kind: l.kind, label: l.label ?? l.note, billId: l.billId }));
  }

  /** What Peni says the bank held at the end of a day; null when that day isn't followed. */
  async bankBalanceThrough(cafeId: string, day: string): Promise<number | null> {
    const start = await this.store.getStart(cafeId);
    if (!start || day < start.startedOn) return null;
    const tz = await this.timeZone(cafeId);
    const end = this.dayStart(this.daysBefore(day, -1), tz);
    const until = end < this.justAfterNow() ? end : this.justAfterNow();
    return (await this.store.totals(cafeId, day)).bank + (await this.cardNet(cafeId, start.startedOn, until));
  }

  /**
   * Moves Peni's bank balance by `deltaKurus` to agree with a statement, dated today. The
   * same `source` twice moves once. Needs "cash.manage".
   */
  async correctBank(ctx: StaffContext, source: string, deltaKurus: number, note: string): Promise<void> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    if (!Number.isInteger(deltaKurus) || deltaKurus === 0 || Math.abs(deltaKurus) > MONEY_MAX_KURUS) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
    if (!(await this.store.getStart(cafeId))) throw new AppError("MONEY_NOT_STARTED", "Enter the opening amounts first", 409);
    const today = await this.today(cafeId);
    await this.assertOpen(cafeId, today);
    if ((await this.store.listBySource(cafeId, source)).length) return;
    await this.store.addMovements([this.movement(ctx, "bank", deltaKurus, "correction", source, today, note.slice(0, NOTE_MAX), null)]);
  }

  // ─────────────────────────────────────────────── Ay kapanışı

  async months(ctx: StaffContext): Promise<MonthsDTO> {
    this.require(ctx, "cash.manage");
    const cafeId = ctx.cafe.id;
    const [today, closes] = await Promise.all([this.today(cafeId), this.store.listCloses(cafeId)]);
    const next = nextMonthToClose(closes, today);
    const canClose = ctx.permissions.has("cash.periods");
    const latest = standingCloses(closes)[0];
    const names = await this.names(closes.flatMap((c) => [c.closedById, c.reopenedById]));
    return {
      today,
      closedThrough: closedThrough(closes),
      next: next ? { month: next, summary: await this.summary(cafeId, next) } : null,
      closes: closes.map(
        (c): MonthCloseDTO => ({
          id: c.id,
          month: c.month,
          closedAt: c.closedAt.toISOString(),
          by: names.get(c.closedById) ?? null,
          note: c.note,
          // Closes kept before wages were part of a month read as none.
          summary: { ...c.summary, wages: c.summary.wages ?? { earnedKurus: 0, paidKurus: 0 }, owed: { ...c.summary.owed, wagesKurus: c.summary.owed.wagesKurus ?? 0 } },
          reopenedAt: c.reopenedAt?.toISOString() ?? null,
          reopenedBy: c.reopenedById ? (names.get(c.reopenedById) ?? null) : null,
          reopenReason: c.reopenReason,
          canReopen: canClose && c.id === latest?.id,
        }),
      ),
      canClose,
    };
  }

  /** "Ayı kapat": only the next month in order, and only once it is over. */
  async closeMonth(ctx: StaffContext, input: { month: string; note?: string }): Promise<MonthsDTO> {
    this.require(ctx, "cash.periods");
    const cafeId = ctx.cafe.id;
    if (!validMonth(input.month)) throw new AppError("MONTH_NOT_CLOSABLE", "Check the month", 400);
    const note = this.note(input.note);
    const today = await this.today(cafeId);
    await this.atomically(async () => {
      const closes = await this.store.listCloses(cafeId);
      if (standingCloses(closes).some((c) => c.month === input.month)) return;
      if (nextMonthToClose(closes, today) !== input.month) throw new AppError("MONTH_NOT_CLOSABLE", "Months close in order, once they are over", 409);
      const close: MonthClose = {
        id: `mcl_${randomUUID()}`,
        cafeId,
        month: input.month,
        closedAt: this.now(),
        closedById: ctx.member.id,
        note,
        summary: await this.summary(cafeId, input.month),
        reopenedAt: null,
        reopenedById: null,
        reopenReason: null,
      };
      if (!(await this.store.saveClose(close))) throw new AppError("MONTH_CLOSED", "That month was just closed", 409);
    });
    return this.months(ctx);
  }

  /** "Yeniden aç": the latest close only, with why. Its numbers stay on the page, marked reopened. */
  async reopen(ctx: StaffContext, closeId: string, input: { reason: string }): Promise<MonthsDTO> {
    this.require(ctx, "cash.periods");
    const cafeId = ctx.cafe.id;
    const reason = input.reason.trim();
    if (!reason) throw new AppError("REASON_REQUIRED", "Say why", 400);
    if (reason.length > NOTE_MAX) throw new AppError("REASON_TOO_LONG", "Keep it short", 400);
    await this.atomically(async () => {
      const close = await this.store.getClose(cafeId, closeId);
      if (!close) throw new AppError("MONTH_NOT_FOUND", "No such close", 404);
      if (close.reopenedAt) return;
      if (standingCloses(await this.store.listCloses(cafeId))[0]?.id !== close.id)
        throw new AppError("REOPEN_LATEST_ONLY", "Only the last closed month can be reopened", 409);
      await this.store.saveClose({ ...close, reopenedAt: this.now(), reopenedById: ctx.member.id, reopenReason: reason });
    });
    return this.months(ctx);
  }

  /** A month's numbers, worked out from what is recorded now. */
  async summary(cafeId: string, month: string): Promise<MonthSummary> {
    const { from, to } = monthDays(month);
    const tz = await this.timeZone(cafeId);
    const fromAt = this.dayStart(from, tz);
    const toAt = this.dayStart(monthDays(addMonths(month, 1)).from, tz);
    const [settled, bills, billPayments, checks, loans, repayments, cardPayments, start, sessions, workDays, rates, payouts] = await Promise.all([
      this.payments.listSettled(cafeId, fromAt, toAt),
      this.bills.listBills(cafeId, { to }),
      this.bills.listPayments(cafeId),
      this.debts.listChecks(cafeId),
      this.debts.listLoans(cafeId),
      this.debts.listRepayments(cafeId),
      this.debts.listCardPayments(cafeId),
      this.store.getStart(cafeId),
      this.cash.listSessions(cafeId, SESSIONS),
      this.shifts.listWorkDays(cafeId, "0000-01-01", to),
      this.shifts.listRates(cafeId),
      this.shifts.listPayouts(cafeId, { paidThrough: to }),
    ]);
    const net = (method: Payment["method"]) =>
      settled.filter((p) => p.method === method).reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0);
    const sales = { cashKurus: net("cash"), cardKurus: net("card"), totalKurus: 0 };
    sales.totalKurus = sales.cashKurus + sales.cardKurus;

    const inMonth = bills.filter((b) => b.date >= from && !b.voidedAt);
    const paidKurus: Record<string, number> = {};
    for (const p of billPayments) if (p.paidOn >= from && p.paidOn <= to) paidKurus[p.method] = (paidKurus[p.method] ?? 0) + p.amountKurus;

    let drawerKurus: number | null = null;
    const counted = sessions.filter((s) => s.closing && s.closing.at < toAt).sort((a, b) => b.closing!.at.getTime() - a.closing!.at.getTime())[0];
    if (counted) drawerKurus = counted.closing!.countKurus;
    let reserveKurus: number | null = null;
    let bankKurus: number | null = null;
    if (start && start.startedOn <= to) {
      const totals = await this.store.totals(cafeId, to);
      reserveKurus = totals.reserve;
      bankKurus = totals.bank + (await this.cardNet(cafeId, start.startedOn, toAt));
    }

    const paidBy = new Map<string, number>();
    for (const p of billPayments) if (p.paidOn <= to) paidBy.set(p.billId, (paidBy.get(p.billId) ?? 0) + p.amountKurus);
    const billsKurus = bills.filter((b) => !b.voidedAt).reduce((s, b) => s + Math.max(0, b.totalKurus - (paidBy.get(b.id) ?? 0)), 0);
    const checksKurus = checks.filter((c) => c.writtenOn <= to && (!c.cashedOn || c.cashedOn > to)).reduce((s, c) => s + c.amountKurus, 0);
    let loansKurus = 0;
    for (const key of new Set(loans.map((l) => l.lenderKey))) {
      const lent = loans.filter((l) => l.lenderKey === key && l.borrowedOn <= to);
      const repaid = repayments.filter((r) => r.lenderKey === key && r.paidOn <= to).reduce((s, r) => s + r.amountKurus, 0);
      loansKurus += loansLeft(lent, repaid).reduce((s, l) => s + l.leftKurus, 0);
    }
    const charged = billPayments.filter((p) => p.method === "credit" && p.paidOn <= to).reduce((s, p) => s + p.amountKurus, 0);
    const cardPaid = cardPayments.filter((p) => p.paidOn <= to).reduce((s, p) => s + p.amountKurus, 0);
    const cardKurus = Math.max(0, charged - cardPaid);
    const wages = {
      earnedKurus: workDays.filter((d) => d.day >= from).reduce((s, d) => s + dayPay(d.minutes, rateOn(rates, d.memberId, d.day)), 0),
      paidKurus: payouts.filter((p) => p.paidOn >= from).reduce((s, p) => s + p.amountKurus, 0),
    };
    let wagesKurus = 0;
    for (const months of owedByMonth(workDays, rates, payouts).values()) for (const k of months.values()) wagesKurus += k;
    return {
      month,
      from,
      to,
      sales,
      bills: { count: inMonth.length, totalKurus: inMonth.reduce((s, b) => s + b.totalKurus, 0), paidKurus },
      wages,
      money: { drawerKurus, reserveKurus, bankKurus },
      owed: { billsKurus, checksKurus, loansKurus, cardKurus, wagesKurus, totalKurus: billsKurus + checksKurus + loansKurus + cardKurus + wagesKurus },
    };
  }

  // ─────────────────────────────────────────────── helpers

  /** The reserve's and the bank's movements, each day's sales, and the drawer's moves and count differences. */
  private async lines(cafeId: string, since: string, through: string | null): Promise<MoneyLineDTO[]> {
    const tz = await this.timeZone(cafeId);
    const sinceAt = this.dayStart(since, tz);
    const [movements, settled, sessions, billPayments, bills, checks, loans, repayments, card, payouts] = await Promise.all([
      this.store.listMovements(cafeId, { since }),
      this.payments.listSettled(cafeId, sinceAt, this.justAfterNow()),
      this.cash.listSessions(cafeId, SESSIONS),
      this.bills.listPayments(cafeId),
      this.bills.listBills(cafeId, { from: this.daysBefore(since, 400), includeVoided: true }),
      this.debts.listChecks(cafeId),
      this.debts.listLoans(cafeId),
      this.debts.listRepayments(cafeId),
      this.debts.getCard(cafeId),
      this.shifts.listPayouts(cafeId),
    ]);
    const payee = new Map(payouts.map((p) => [p.id, p.memberId]));
    const payeeNames = await this.names(payouts.map((p) => p.memberId));
    const suppliers = new Map((await this.bills.listSuppliers(cafeId, { includeArchived: true })).map((s) => [s.id, s.name]));
    const billOf = new Map(bills.map((b) => [b.id, b]));
    const paymentBill = new Map(billPayments.map((p) => [p.id, p.billId]));
    const lenderName = new Map(loans.map((l) => [l.lenderKey, l.lenderName]));
    const repaymentLender = new Map(repayments.map((r) => [r.id, r.lenderKey]));
    const checkNumber = new Map(checks.map((c) => [c.id, c.number]));

    /** What a source was, for the line: its kind, its label, and its bill. */
    const describe = (source: string): { kind: MoneyLineDTO["kind"]; label: string | null; billId: string | null } => {
      const [type, id = ""] = source.split(":");
      if (type === "bill_payment") {
        const bill = billOf.get(paymentBill.get(id) ?? "");
        const name = bill ? (bill.supplierId && suppliers.get(bill.supplierId)) || bill.lines[0]?.name || null : null;
        return { kind: "bill", label: name, billId: bill?.id ?? null };
      }
      if (type === "check") return { kind: "check", label: checkNumber.get(id) ?? null, billId: null };
      if (type === "repayment") return { kind: "repayment", label: lenderName.get(repaymentLender.get(id) ?? "") ?? null, billId: null };
      if (type === "card_payment") return { kind: "card", label: card?.name ?? null, billId: null };
      if (type === "pay") return { kind: "wages", label: payeeNames.get(payee.get(id) ?? "") ?? null, billId: null };
      if (type === "statement") return { kind: "correction", label: null, billId: null };
      return { kind: "transfer", label: null, billId: null };
    };

    const members = new Set<string>();
    const lines: (MoneyLineDTO & { memberId: string | null })[] = [];
    const manualOpen = (day: string) => !through || day > through;
    for (const m of movements) {
      const manual = m.source.startsWith("manual:");
      const what = m.kind === "opening" || m.kind === "correction" || manual ? { kind: m.kind, label: null, billId: null } : describe(m.source);
      lines.push({
        id: m.id,
        day: m.day,
        at: m.createdAt.toISOString(),
        account: m.account,
        kind: what.kind,
        amountKurus: m.amountKurus,
        counterpart: m.counterpart,
        label: what.label,
        note: m.note,
        by: null,
        memberId: m.memberId,
        reversal: false,
        billId: what.billId,
        undoId: null,
      });
      members.add(m.memberId);
    }

    // Each day's card sales into the bank, and cash sales into the drawer.
    const byDay = new Map<string, { cash: number; card: number; at: Date }>();
    for (const p of settled) {
      if (p.method !== "cash" && p.method !== "card") continue;
      const day = localDateKey(p.settledAt!, tz);
      const d = byDay.get(day) ?? { cash: 0, card: 0, at: p.settledAt! };
      d[p.method] += p.kind === "sale" ? p.amountKurus : -p.amountKurus;
      if (p.settledAt! > d.at) d.at = p.settledAt!;
      byDay.set(day, d);
    }
    for (const [day, d] of byDay) {
      for (const account of ["bank", "drawer"] as const) {
        const amountKurus = account === "bank" ? d.card : d.cash;
        if (!amountKurus) continue;
        lines.push({
          id: `sales:${account}:${day}`,
          day,
          at: d.at.toISOString(),
          account,
          kind: "sales",
          amountKurus,
          counterpart: null,
          label: null,
          note: null,
          by: null,
          memberId: null,
          reversal: false,
          billId: null,
          undoId: null,
        });
      }
    }

    // The drawer: cash put in and taken out, payments and transfers, and count differences.
    for (const s of sessions) {
      if (s.opening.at < sinceAt && (!s.closing || s.closing.at < sinceAt)) continue;
      for (const count of [s.opening, s.closing]) {
        if (!count || !count.differenceKurus || count.at < sinceAt) continue;
        lines.push({
          id: `diff:${s.id}:${count === s.opening ? "open" : "close"}`,
          day: localDateKey(count.at, tz),
          at: count.at.toISOString(),
          account: "drawer",
          kind: "difference",
          amountKurus: count.differenceKurus,
          counterpart: null,
          label: count.note,
          note: null,
          by: null,
          memberId: count.byMemberId,
          reversal: false,
          billId: null,
          undoId: null,
        });
        members.add(count.byMemberId);
      }
      for (const move of await this.cash.listMoves(cafeId, s.id)) {
        if (move.at < sinceAt) continue;
        lines.push({ ...this.drawerLine(move, s, describe, movements, manualOpen(localDateKey(move.at, tz)), tz), memberId: move.byMemberId });
        members.add(move.byMemberId);
      }
    }

    // A manual movement can be undone while its month is open and, for a drawer side, its drawer day.
    for (const line of lines) {
      if (line.account === "drawer" || line.kind === "opening" || !manualOpen(line.day)) continue;
      const m = movements.find((x) => x.id === line.id);
      if (!m?.source.startsWith("manual:")) continue;
      const drawerSide = lines.find((l) => l.account === "drawer" && l.id === `move:${m.source}`);
      if (!drawerSide || drawerSide.undoId) line.undoId = m.source.slice(7);
    }

    const names = await this.names([...members]);
    return lines
      .map(({ memberId, ...l }) => ({ ...l, by: memberId ? (names.get(memberId) ?? null) : null }))
      .sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  }

  private drawerLine(
    move: CashMove,
    session: CashSession,
    describe: (source: string) => { kind: MoneyLineDTO["kind"]; label: string | null; billId: string | null },
    movements: MoneyMovement[],
    monthOpen: boolean,
    tz: string,
  ): MoneyLineDTO {
    const base = {
      day: localDateKey(move.at, tz),
      at: move.at.toISOString(),
      account: "drawer" as const,
      amountKurus: move.kind === "in" ? move.amountKurus : -move.amountKurus,
      by: null,
      note: null,
      reversal: false,
      billId: null as string | null,
      counterpart: null as MoneyAccountDTO | null,
      undoId: null as string | null,
    };
    if (!move.key.startsWith("src:")) return { ...base, id: move.id, kind: "drawer", label: move.reason };
    const reversal = move.key.endsWith(":undo");
    const source = move.key.slice(4).replace(/:undo$/, "");
    if (source.startsWith("manual:")) {
      const other = movements.find((m) => m.source === source);
      const undoable = monthOpen && !session.closing;
      return {
        ...base,
        id: `move:${source}`,
        kind: "transfer",
        counterpart: other?.account ?? null,
        label: null,
        note: other?.note ?? (DRAWER_REASON[`${move.kind}:${other?.account}`] ? null : move.reason),
        undoId: undoable ? source.slice(7) : null,
      };
    }
    const what = describe(source);
    // A payment undone since is gone; its name is still at the end of the Kasa reason.
    const label = what.label ?? move.reason.split(" · ").at(-1) ?? null;
    return { ...base, id: move.id, kind: what.kind, label, billId: what.billId, reversal };
  }

  /** One side of a manual transfer: a Kasa move for the drawer, a movement for the others. */
  private async side(
    ctx: StaffContext,
    account: MoneyAccount,
    amountKurus: number,
    source: string,
    day: string,
    note: string | null,
    counterpart: MoneyAccount,
    reason: string,
  ) {
    if (account === "drawer") {
      const session = await this.cash.openSession(ctx.cafe.id);
      if (!session) throw new AppError("CASH_CLOSED", "Open the drawer first", 409);
      if (amountKurus < 0 && -amountKurus > (await this.drawerExpected(session)))
        throw new AppError("CASH_TOO_LOW", "There isn't that much in the drawer", 409);
      await this.cash.saveMove(this.drawerMove(ctx, session, `src:${source}`, amountKurus, reason));
      return;
    }
    if (account === "reserve" && amountKurus < 0 && -amountKurus > (await this.store.totals(ctx.cafe.id)).reserve) {
      throw new AppError("RESERVE_TOO_LOW", "There isn't that much in the reserve", 409);
    }
    await this.store.addMovements([this.movement(ctx, account, amountKurus, "transfer", source, day, note, counterpart)]);
  }

  private drawerMove(ctx: StaffContext, session: CashSession, key: string, amountKurus: number, reason: string): CashMove {
    return {
      id: `cmv_${keyHash(ctx.cafe.id, key)}`,
      cafeId: ctx.cafe.id,
      sessionId: session.id,
      kind: amountKurus > 0 ? "in" : "out",
      amountKurus: Math.abs(amountKurus),
      reason: reason.slice(0, NOTE_MAX),
      at: this.now(),
      byMemberId: ctx.member.id,
      key,
    };
  }

  private movement(
    ctx: StaffContext,
    account: KeptAccount,
    amountKurus: number,
    kind: MovementKind,
    source: string,
    day: string,
    note: string | null,
    counterpart: MoneyAccount | null,
  ): MoneyMovement {
    return {
      id: `mmv_${keyHash(ctx.cafe.id, `${source}|${account}`)}`,
      cafeId: ctx.cafe.id,
      account,
      amountKurus,
      kind,
      counterpart,
      source,
      day,
      note,
      memberId: ctx.member.id,
      createdAt: this.now(),
    };
  }

  private async drawerExpected(session: CashSession): Promise<number> {
    const [payments, moves] = await Promise.all([
      this.payments.listCashSessionPayments(session.cafeId, session.id),
      this.cash.listMoves(session.cafeId, session.id),
    ]);
    return cashTotals(session, payments, moves).expectedKurus;
  }

  /** Card sales less card refunds from the start of `since` until `until`: the bank's takings. */
  private async cardNet(cafeId: string, since: string, until: Date): Promise<number> {
    const tz = await this.timeZone(cafeId);
    const settled = await this.payments.listSettled(cafeId, this.dayStart(since, tz), until);
    return settled.filter((p) => p.method === "card").reduce((s, p) => s + (p.kind === "sale" ? p.amountKurus : -p.amountKurus), 0);
  }

  private note(raw: string | undefined): string | null {
    const n = raw?.trim() ?? "";
    if (n.length > NOTE_MAX) throw new AppError("REASON_TOO_LONG", "Keep it short", 400);
    return n || null;
  }

  /** Payments settled this very moment count too. */
  private justAfterNow(): Date {
    return new Date(this.now().getTime() + 1);
  }

  /** Local midnight at the start of a "YYYY-MM-DD" day. */
  private dayStart(day: string, tz: string): Date {
    return startOfLocalDay(new Date(`${day}T12:00:00Z`), tz);
  }

  private daysBefore(day: string, n: number): string {
    return addDays(new Date(`${day}T12:00:00Z`), -n)
      .toISOString()
      .slice(0, 10);
  }

  private async timeZone(cafeId: string): Promise<string> {
    return (await this.directory.getSettings(cafeId)).timeZone;
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), await this.timeZone(cafeId));
  }

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
      const member = await this.staff.getMember(id);
      const account = member && (await this.staff.getAccount(member.accountId));
      if (account) out.set(id, account.name);
    }
    return out;
  }

  private require(ctx: StaffContext, permission: Permission): void {
    if (ctx.permissions.has(permission)) return;
    if (ctx.rolePermissions.has(permission)) throw new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403);
    throw new AppError("FORBIDDEN", "Your role can't do this", 403);
  }
}
