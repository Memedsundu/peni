import type { CashCountDTO, CashSessionDTO, CashStateDTO } from "@peni/api";
import {
  cashTotals,
  countTotal,
  DENOMINATIONS,
  type CashCount,
  type CashCounts,
  type CashMove,
  type CashMoveKind,
  type CashSession,
  type CashStore,
  type PaymentStore,
  type Permission,
  type StaffStore,
} from "@peni/core";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import { requirePermission, type StaffContext } from "./staff";

/** The most a single count or move can be: ₺1.000.000. */
export const CASH_MAX_KURUS = 100_000_000;
export const CASH_NOTE_MAX = 200;

type CountInput = { key: string; countKurus?: number; counts?: CashCounts; note?: string };

/**
 * Kasa (plan piece 9): open the drawer with a count, put cash in or take it out with a
 * reason, close it with a count. Shelby's rules: a count that doesn't match what should
 * be there needs a reason, and the difference is kept with who counted it. Cash can't be
 * taken while the drawer is closed; every payment made while it's open is stamped with
 * its session, so the session's sums never depend on clocks.
 */
export class CashService {
  constructor(
    private readonly store: CashStore,
    private readonly payments: PaymentStore,
    private readonly staff: StaffStore,
    private readonly now: () => Date,
  ) {}

  /** The drawer that's open at the café, if any. */
  current(cafeId: string): Promise<CashSession | null> {
    return this.store.openSession(cafeId);
  }

  /** The open session, or the last closed one with what it was left with. */
  async state(ctx: StaffContext): Promise<CashStateDTO> {
    this.require(ctx, "cash.drawer");
    const [open, last] = await Promise.all([this.store.openSession(ctx.cafe.id), this.store.lastClosed(ctx.cafe.id)]);
    return {
      open: open ? await this.dto(open) : null,
      last: last ? await this.dto(last) : null,
      denominations: [...DENOMINATIONS],
    };
  }

  /** "Kasayı aç": counted against what the last close left in it. */
  async open(ctx: StaffContext, input: CountInput): Promise<CashStateDTO> {
    this.require(ctx, "cash.drawer");
    const again = await this.store.findByKey(ctx.cafe.id, input.key);
    if (again) return this.state(ctx);
    if (await this.store.openSession(ctx.cafe.id)) throw new AppError("CASH_ALREADY_OPEN", "The drawer is already open", 409);
    const last = await this.store.lastClosed(ctx.cafe.id);
    const session: CashSession = {
      id: `cash_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      opening: this.count(ctx, input, last?.closing?.countKurus ?? null),
      closing: null,
      openKey: input.key,
      closeKey: null,
    };
    // Another till opened it a moment ago: show that one.
    if (!(await this.store.saveSession(session))) throw new AppError("CASH_ALREADY_OPEN", "The drawer is already open", 409);
    return this.state(ctx);
  }

  /** "Kasaya para koy" or "Kasadan para al", with a reason. */
  async move(ctx: StaffContext, input: { key: string; kind: CashMoveKind; amountKurus: number; reason: string }): Promise<CashStateDTO> {
    this.require(ctx, "cash.drawer");
    if (await this.store.findMoveByKey(ctx.cafe.id, input.key)) return this.state(ctx);
    const session = await this.store.openSession(ctx.cafe.id);
    if (!session) throw new AppError("CASH_CLOSED", "Open the drawer first", 409);
    amount(input.amountKurus, false);
    const reason = note(input.reason);
    if (!reason) throw new AppError("REASON_REQUIRED", "Write a reason", 400);
    if (input.kind === "out" && input.amountKurus > (await this.totals(session)).expectedKurus) {
      throw new AppError("CASH_TOO_LOW", "There isn't that much in the drawer", 409);
    }
    const move: CashMove = {
      id: `cmv_${randomUUID()}`,
      cafeId: ctx.cafe.id,
      sessionId: session.id,
      kind: input.kind,
      amountKurus: input.amountKurus,
      reason,
      at: this.now(),
      byMemberId: ctx.member.id,
      key: input.key,
    };
    await this.store.saveMove(move);
    return this.state(ctx);
  }

  /** "Kasayı kapat": counted against the opening count and the session's cash. */
  async close(ctx: StaffContext, input: CountInput & { sessionId: string }): Promise<CashStateDTO> {
    this.require(ctx, "cash.drawer");
    const again = await this.store.findByKey(ctx.cafe.id, input.key);
    if (again) return this.state(ctx);
    const session = await this.store.openSession(ctx.cafe.id);
    // Closed from another till, or a new day was opened since this screen loaded.
    if (!session || session.id !== input.sessionId) throw new AppError("CASH_SESSION_CHANGED", "The drawer changed; look again", 409);
    const closing = this.count(ctx, input, (await this.totals(session)).expectedKurus);
    await this.store.saveSession({ ...session, closing, closeKey: input.key });
    return this.state(ctx);
  }

  private count(ctx: StaffContext, input: CountInput, expectedKurus: number | null): CashCount {
    let countKurus = input.countKurus;
    if (input.counts) {
      const total = countTotal(input.counts);
      if (total === null) throw new AppError("COUNT_INVALID", "Check the count", 400);
      if (countKurus !== undefined && countKurus !== total) throw new AppError("COUNT_INVALID", "The total doesn't match the notes and coins", 400);
      countKurus = total;
    }
    if (countKurus === undefined) throw new AppError("COUNT_INVALID", "Enter the count", 400);
    amount(countKurus, true);
    const differenceKurus = expectedKurus === null ? 0 : countKurus - expectedKurus;
    const why = note(input.note ?? "");
    if (differenceKurus !== 0 && !why) throw new AppError("DIFFERENCE_REASON_REQUIRED", "The count doesn't match: write why", 400);
    return { expectedKurus, countKurus, differenceKurus, counts: input.counts ? { ...input.counts } : null, note: why, at: this.now(), byMemberId: ctx.member.id };
  }

  private async totals(session: CashSession) {
    const [payments, moves] = await Promise.all([
      this.payments.listCashSessionPayments(session.cafeId, session.id),
      this.store.listMoves(session.cafeId, session.id),
    ]);
    return cashTotals(session, payments, moves);
  }

  private async dto(session: CashSession): Promise<CashSessionDTO> {
    const [payments, moves] = await Promise.all([
      this.payments.listCashSessionPayments(session.cafeId, session.id),
      this.store.listMoves(session.cafeId, session.id),
    ]);
    const names = await this.names([session.opening.byMemberId, session.closing?.byMemberId, ...moves.map((m) => m.byMemberId)]);
    const name = (id: string) => names.get(id) ?? "Eski ekip üyesi";
    const count = (c: CashCount): CashCountDTO => ({
      at: c.at.toISOString(),
      by: name(c.byMemberId),
      expectedKurus: c.expectedKurus,
      countKurus: c.countKurus,
      differenceKurus: c.differenceKurus,
      counts: c.counts,
      note: c.note,
    });
    return {
      id: session.id,
      opening: count(session.opening),
      closing: session.closing ? count(session.closing) : null,
      totals: cashTotals(session, payments, moves),
      moves: moves.map((m) => ({ id: m.id, kind: m.kind, amountKurus: m.amountKurus, reason: m.reason, at: m.at.toISOString(), by: name(m.byMemberId) })),
    };
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
    requirePermission(ctx, permission);
  }
}

function amount(value: number, zeroOk: boolean): void {
  if (!Number.isInteger(value) || value < (zeroOk ? 0 : 1) || value > CASH_MAX_KURUS) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
}

function note(raw: string): string | null {
  const n = raw.trim();
  if (n.length > CASH_NOTE_MAX) throw new AppError("REASON_TOO_LONG", "Keep it short", 400);
  return n || null;
}
