import type { MoneyAccount } from "./books";
import type { Kurus } from "./money";

/**
 * Borçlar (plan piece 19): everything the café owes besides open bills. A bill paid with a
 * check, the credit card or someone's own money counts as paid on Faturalar, and what is
 * owed moves here:
 *
 * - a check is owed until the bank pays it out ("Tahsil edildi"), not from the day it was
 *   written;
 * - money a person put in is owed to them until it is paid back, oldest first;
 * - the credit card is owed from the day of each charge, and its statement closes and falls
 *   due on the days the café sets.
 *
 * Shelby's version kept the card's days fixed in code, warned by the calendar instead of by
 * what was actually owed, and lost a debt when the expense behind it was deleted. Here a bill
 * payment that made a check or a debt can't be undone once the check is cashed or the debt
 * paid back, and the card is worked out from its charges and payments every time.
 */

/** Cash, the bank card, or a transfer: how a debt is paid back. */
export type MoneyMethod = "cash" | "card" | "bank";
export const MONEY_METHODS: readonly MoneyMethod[] = ["cash", "card", "bank"];

export const CHECK_NUMBER_MAX = 30;
export const DEBT_NAME_MAX = 80;
export const DEBT_NOTE_MAX = 300;
/** Statement and due days stop at 28, so every month has them. */
export const CARD_DAY_MAX = 28;

export interface Check {
  id: string;
  cafeId: string;
  /** The number printed on the check leaf. */
  number: string;
  bankName: string | null;
  /** Who it was written to; the supplier's name is used when this is empty. */
  payee: string | null;
  supplierId: string | null;
  amountKurus: Kurus;
  /** The day it was handed over, in the café's time zone. */
  writtenOn: string;
  /** The day on the check (vade): the money has to be in the bank by then. */
  dueDate: string;
  note: string | null;
  /** The bill payment that wrote it; null for a check written on its own. */
  billPaymentId: string | null;
  /** The day the bank paid it out; null while it is still owed. */
  cashedOn: string | null;
  cashedById: string | null;
  createdById: string;
  createdAt: Date;
}

/** Money someone put in for the café: a bill they paid themselves, or cash they lent. */
export interface Loan {
  id: string;
  cafeId: string;
  /** See lenderKey: a team member's id, or the lender's name. */
  lenderKey: string;
  lenderMemberId: string | null;
  lenderName: string;
  amountKurus: Kurus;
  borrowedOn: string;
  /** When it was promised back, if it was. */
  dueDate: string | null;
  note: string | null;
  billPaymentId: string | null;
  createdById: string;
  createdAt: Date;
}

/** Paid back to a lender. It pays off their oldest loans first. */
export interface LoanRepayment {
  id: string;
  cafeId: string;
  lenderKey: string;
  amountKurus: Kurus;
  method: MoneyMethod;
  paidOn: string;
  /** Where the money came from (piece 20); null before the café started keeping its money. */
  account: MoneyAccount | null;
  memberId: string;
  createdAt: Date;
}

/** The café's credit card. One per café; its charges are bill payments by "credit". */
export interface CardSettings {
  cafeId: string;
  name: string;
  limitKurus: Kurus;
  /** Hesap kesim günü. */
  statementDay: number;
  /** Son ödeme günü: the first such day after the statement closes. */
  dueDay: number;
  updatedAt: Date;
}

/** Paid towards the credit card. The bank card can't pay the credit card. */
export interface CardPayment {
  id: string;
  cafeId: string;
  amountKurus: Kurus;
  method: "cash" | "bank";
  paidOn: string;
  /** Where the money came from (piece 20); null before the café started keeping its money. */
  account: MoneyAccount | null;
  memberId: string;
  createdAt: Date;
}

export interface DebtStore {
  /** By due date, then number. */
  listChecks(cafeId: string, opts?: { open?: boolean }): Promise<Check[]>;
  getCheck(cafeId: string, id: string): Promise<Check | null>;
  findCheckByPayment(cafeId: string, billPaymentId: string): Promise<Check | null>;
  saveCheck(check: Check): Promise<void>;
  removeCheck(cafeId: string, id: string): Promise<void>;

  /** Oldest first: the order repayments pay them off in. */
  listLoans(cafeId: string, opts?: { lenderKey?: string }): Promise<Loan[]>;
  getLoan(cafeId: string, id: string): Promise<Loan | null>;
  findLoanByPayment(cafeId: string, billPaymentId: string): Promise<Loan | null>;
  saveLoan(loan: Loan): Promise<void>;
  removeLoan(cafeId: string, id: string): Promise<void>;

  /** Oldest first. */
  listRepayments(cafeId: string, opts?: { lenderKey?: string }): Promise<LoanRepayment[]>;
  getRepayment(cafeId: string, id: string): Promise<LoanRepayment | null>;
  addRepayment(r: LoanRepayment): Promise<void>;
  removeRepayment(cafeId: string, id: string): Promise<void>;

  getCard(cafeId: string): Promise<CardSettings | null>;
  saveCard(card: CardSettings): Promise<void>;
  /** Oldest first. */
  listCardPayments(cafeId: string): Promise<CardPayment[]>;
  getCardPayment(cafeId: string, id: string): Promise<CardPayment | null>;
  addCardPayment(p: CardPayment): Promise<void>;
  removeCardPayment(cafeId: string, id: string): Promise<void>;
}

/** Who a loan is owed to: a team member by id, anyone else by name ("Annem" and "annem " are one lender). */
export function lenderKey(lender: { memberId: string | null; name: string }): string {
  if (lender.memberId) return `member:${lender.memberId}`;
  return `name:${lender.name.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr")}`;
}

/** What is left of each loan once `repaidKurus` has paid off the oldest ones first. */
export function loansLeft<T extends Pick<Loan, "amountKurus" | "borrowedOn" | "createdAt">>(
  loans: readonly T[],
  repaidKurus: Kurus,
): (T & { leftKurus: Kurus })[] {
  let rest = repaidKurus;
  return [...loans]
    .sort((a, b) => a.borrowedOn.localeCompare(b.borrowedOn) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((loan) => {
      const paid = Math.min(rest, loan.amountKurus);
      rest -= paid;
      return { ...loan, leftKurus: loan.amountKurus - paid };
    });
}

export interface CardStatement {
  /** Everything charged and not yet paid. */
  balanceKurus: Kurus;
  /** Limit minus balance; below zero when the card is over its limit (nothing stops a charge). */
  remainingKurus: Kurus;
  /** The last statement day on or before today, and the day it is due. */
  lastClose: string;
  dueDate: string;
  /** What the last statement asks for, less everything paid since. */
  statementKurus: Kurus;
  /** Of a statement whose due day has passed, what is still unpaid. */
  overdueKurus: Kurus;
  nextClose: string;
}

/**
 * The card's state on `today`, from its charges and payments. Payments pay the oldest
 * charges first, so a statement is settled once everything up to its close is paid.
 */
export function cardStatement(
  card: Pick<CardSettings, "limitKurus" | "statementDay" | "dueDay">,
  charges: readonly { amountKurus: Kurus; paidOn: string }[],
  payments: readonly { amountKurus: Kurus; paidOn: string }[],
  today: string,
): CardStatement {
  const paid = payments.reduce((s, p) => s + p.amountKurus, 0);
  const upTo = (day: string) => charges.filter((c) => c.paidOn <= day).reduce((s, c) => s + c.amountKurus, 0);
  const balanceKurus = upTo("9999-12-31") - paid;
  const lastClose = closeOnOrBefore(today, card.statementDay);
  const dueDate = dueAfter(lastClose, card.dueDay);
  let late = lastClose;
  while (dueAfter(late, card.dueDay) >= today) late = addMonths(late, -1, card.statementDay);
  return {
    balanceKurus,
    remainingKurus: card.limitKurus - balanceKurus,
    lastClose,
    dueDate,
    statementKurus: Math.max(0, upTo(lastClose) - paid),
    overdueKurus: Math.max(0, upTo(late) - paid),
    nextClose: addMonths(lastClose, 1, card.statementDay),
  };
}

function ymd(y: number, m: number, d: number): string {
  // m may run past 12 or below 1; Date.UTC carries it into the year.
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

function parts(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y!, m!, d!];
}

function closeOnOrBefore(today: string, statementDay: number): string {
  const [y, m, d] = parts(today);
  return d >= statementDay ? ymd(y, m, statementDay) : ymd(y, m - 1, statementDay);
}

function dueAfter(close: string, dueDay: number): string {
  const [y, m, d] = parts(close);
  return dueDay > d ? ymd(y, m, dueDay) : ymd(y, m + 1, dueDay);
}

function addMonths(day: string, months: number, dayOfMonth: number): string {
  const [y, m] = parts(day);
  return ymd(y, m + months, dayOfMonth);
}

function byCheckDue(a: Check, b: Check): number {
  return a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number);
}

function oldestFirst<T extends { createdAt: Date }>(day: (x: T) => string) {
  return (a: T, b: T) => day(a).localeCompare(day(b)) || a.createdAt.getTime() - b.createdAt.getTime();
}

export class InMemoryDebtStore implements DebtStore {
  private readonly checks = new Map<string, Check>();
  private readonly loans = new Map<string, Loan>();
  private readonly repayments = new Map<string, LoanRepayment>();
  private readonly cards = new Map<string, CardSettings>();
  private readonly cardPayments = new Map<string, CardPayment>();

  async listChecks(cafeId: string, opts: { open?: boolean } = {}) {
    return [...this.checks.values()]
      .filter((c) => c.cafeId === cafeId && (!opts.open || !c.cashedOn))
      .sort(byCheckDue)
      .map((c) => ({ ...c }));
  }

  async getCheck(cafeId: string, id: string) {
    const c = this.checks.get(id);
    return c && c.cafeId === cafeId ? { ...c } : null;
  }

  async findCheckByPayment(cafeId: string, billPaymentId: string) {
    const c = [...this.checks.values()].find((x) => x.cafeId === cafeId && x.billPaymentId === billPaymentId);
    return c ? { ...c } : null;
  }

  async saveCheck(check: Check) {
    this.checks.set(check.id, { ...check });
  }

  async removeCheck(cafeId: string, id: string) {
    if (this.checks.get(id)?.cafeId === cafeId) this.checks.delete(id);
  }

  async listLoans(cafeId: string, opts: { lenderKey?: string } = {}) {
    return [...this.loans.values()]
      .filter((l) => l.cafeId === cafeId && (!opts.lenderKey || l.lenderKey === opts.lenderKey))
      .sort(oldestFirst((l) => l.borrowedOn))
      .map((l) => ({ ...l }));
  }

  async getLoan(cafeId: string, id: string) {
    const l = this.loans.get(id);
    return l && l.cafeId === cafeId ? { ...l } : null;
  }

  async findLoanByPayment(cafeId: string, billPaymentId: string) {
    const l = [...this.loans.values()].find((x) => x.cafeId === cafeId && x.billPaymentId === billPaymentId);
    return l ? { ...l } : null;
  }

  async saveLoan(loan: Loan) {
    this.loans.set(loan.id, { ...loan });
  }

  async removeLoan(cafeId: string, id: string) {
    if (this.loans.get(id)?.cafeId === cafeId) this.loans.delete(id);
  }

  async listRepayments(cafeId: string, opts: { lenderKey?: string } = {}) {
    return [...this.repayments.values()]
      .filter((r) => r.cafeId === cafeId && (!opts.lenderKey || r.lenderKey === opts.lenderKey))
      .sort(oldestFirst((r) => r.paidOn))
      .map((r) => ({ ...r }));
  }

  async getRepayment(cafeId: string, id: string) {
    const r = this.repayments.get(id);
    return r && r.cafeId === cafeId ? { ...r } : null;
  }

  async addRepayment(r: LoanRepayment) {
    this.repayments.set(r.id, { ...r });
  }

  async removeRepayment(cafeId: string, id: string) {
    if (this.repayments.get(id)?.cafeId === cafeId) this.repayments.delete(id);
  }

  async getCard(cafeId: string) {
    const c = this.cards.get(cafeId);
    return c ? { ...c } : null;
  }

  async saveCard(card: CardSettings) {
    this.cards.set(card.cafeId, { ...card });
  }

  async listCardPayments(cafeId: string) {
    return [...this.cardPayments.values()]
      .filter((p) => p.cafeId === cafeId)
      .sort(oldestFirst((p) => p.paidOn))
      .map((p) => ({ ...p }));
  }

  async getCardPayment(cafeId: string, id: string) {
    const p = this.cardPayments.get(id);
    return p && p.cafeId === cafeId ? { ...p } : null;
  }

  async addCardPayment(p: CardPayment) {
    this.cardPayments.set(p.id, { ...p });
  }

  async removeCardPayment(cafeId: string, id: string) {
    if (this.cardPayments.get(id)?.cafeId === cafeId) this.cardPayments.delete(id);
  }
}
