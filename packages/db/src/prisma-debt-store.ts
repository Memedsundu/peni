import type { CardPayment, CardSettings, Check, DebtStore, Loan, LoanRepayment } from "@peni/core";
import type { Db } from "./db";
import type { CardPayment as CardPaymentRow } from "./generated/client";

function toCardPayment(p: CardPaymentRow): CardPayment {
  // The bank card can't pay the credit card, so a stored payment is cash or bank.
  return { ...p, method: p.method === "card" ? "bank" : p.method };
}

export class PrismaDebtStore implements DebtStore {
  constructor(private readonly db: Db) {}

  async listChecks(cafeId: string, opts: { open?: boolean } = {}): Promise<Check[]> {
    return this.db().debtCheck.findMany({
      where: { cafeId, ...(opts.open ? { cashedOn: null } : {}) },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    });
  }

  async getCheck(cafeId: string, id: string): Promise<Check | null> {
    return this.db().debtCheck.findFirst({ where: { id, cafeId } });
  }

  async findCheckByPayment(cafeId: string, billPaymentId: string): Promise<Check | null> {
    return this.db().debtCheck.findFirst({ where: { cafeId, billPaymentId } });
  }

  async saveCheck(c: Check): Promise<void> {
    await this.db().debtCheck.upsert({ where: { id: c.id }, create: c, update: c });
  }

  async removeCheck(cafeId: string, id: string): Promise<void> {
    await this.db().debtCheck.deleteMany({ where: { id, cafeId } });
  }

  async listLoans(cafeId: string, opts: { lenderKey?: string } = {}): Promise<Loan[]> {
    return this.db().loan.findMany({
      where: { cafeId, ...(opts.lenderKey ? { lenderKey: opts.lenderKey } : {}) },
      orderBy: [{ borrowedOn: "asc" }, { createdAt: "asc" }],
    });
  }

  async getLoan(cafeId: string, id: string): Promise<Loan | null> {
    return this.db().loan.findFirst({ where: { id, cafeId } });
  }

  async findLoanByPayment(cafeId: string, billPaymentId: string): Promise<Loan | null> {
    return this.db().loan.findFirst({ where: { cafeId, billPaymentId } });
  }

  async saveLoan(l: Loan): Promise<void> {
    await this.db().loan.upsert({ where: { id: l.id }, create: l, update: l });
  }

  async removeLoan(cafeId: string, id: string): Promise<void> {
    await this.db().loan.deleteMany({ where: { id, cafeId } });
  }

  async listRepayments(cafeId: string, opts: { lenderKey?: string } = {}): Promise<LoanRepayment[]> {
    return this.db().loanRepayment.findMany({
      where: { cafeId, ...(opts.lenderKey ? { lenderKey: opts.lenderKey } : {}) },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
    });
  }

  async getRepayment(cafeId: string, id: string): Promise<LoanRepayment | null> {
    return this.db().loanRepayment.findFirst({ where: { id, cafeId } });
  }

  async addRepayment(r: LoanRepayment): Promise<void> {
    await this.db().loanRepayment.create({ data: r });
  }

  async removeRepayment(cafeId: string, id: string): Promise<void> {
    await this.db().loanRepayment.deleteMany({ where: { id, cafeId } });
  }

  async getCard(cafeId: string): Promise<CardSettings | null> {
    return this.db().creditCard.findUnique({ where: { cafeId } });
  }

  async saveCard(c: CardSettings): Promise<void> {
    await this.db().creditCard.upsert({ where: { cafeId: c.cafeId }, create: c, update: c });
  }

  async listCardPayments(cafeId: string): Promise<CardPayment[]> {
    const rows = await this.db().cardPayment.findMany({ where: { cafeId }, orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }] });
    return rows.map(toCardPayment);
  }

  async getCardPayment(cafeId: string, id: string): Promise<CardPayment | null> {
    const p = await this.db().cardPayment.findFirst({ where: { id, cafeId } });
    return p ? toCardPayment(p) : null;
  }

  async addCardPayment(p: CardPayment): Promise<void> {
    await this.db().cardPayment.create({ data: p });
  }

  async removeCardPayment(cafeId: string, id: string): Promise<void> {
    await this.db().cardPayment.deleteMany({ where: { id, cafeId } });
  }
}
