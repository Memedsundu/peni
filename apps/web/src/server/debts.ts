import type { CardDTO, CheckDTO, DebtRowDTO, DebtsDTO, LenderDTO } from "@peni/api";
import {
  billState,
  cardStatement,
  loansLeft,
  localDateKey,
  owedByMonth,
  validDate,
  type Bill,
  type BillStore,
  type Check,
  type DebtStore,
  type Loan,
  type MoneyAccount,
  type MoneyMethod,
  type PeniDirectory,
  type Permission,
  type ShiftStore,
  type StaffStore,
} from "@peni/core";
import { AppError } from "./errors";
import { keyHash, type BillService } from "./bills";
import type { MoneyService } from "./money";
import { requirePermission, type StaffContext } from "./staff";

const DAY_MS = 86_400_000;
/** Cashed checks stay on the page this long; card charges shown. */
const CASHED_DAYS = 60;
const CARD_CHARGES = 30;

export interface CheckInput {
  key: string;
  number: string;
  bankName?: string | null;
  payee?: string | null;
  supplierId?: string | null;
  amountKurus: number;
  writtenOn?: string;
  dueDate: string;
  note?: string | null;
}

export interface LoanInput {
  key: string;
  lender: { memberId?: string | null; name?: string };
  amountKurus: number;
  borrowedOn?: string;
  dueDate?: string | null;
  note?: string | null;
}

/**
 * Borçlar (plan piece 19): one list of everything the café owes, and the ways to pay it
 * down. Open bills come from Faturalar as they are; checks, money people put in and the
 * credit card live here. Every change answers with the whole page.
 */
export class DebtService {
  constructor(
    private readonly store: DebtStore,
    private readonly bills: BillStore,
    private readonly billService: BillService,
    private readonly money: MoneyService,
    private readonly shifts: ShiftStore,
    private readonly directory: PeniDirectory,
    private readonly staff: StaffStore,
    private readonly atomically: <T>(fn: () => Promise<T>) => Promise<T>,
    private readonly now: () => Date,
  ) {}

  async get(ctx: StaffContext): Promise<DebtsDTO> {
    this.require(ctx, "debts.view");
    return this.overview(ctx.cafe.id, ctx.permissions);
  }

  /** Borçlar as someone with these permissions sees it. */
  async overview(cafeId: string, permissions: ReadonlySet<Permission>): Promise<DebtsDTO> {
    const canCard = permissions.has("debts.card");
    const today = await this.today(cafeId);
    const [owedBills, checks, loans, repayments, suppliers, cardSettings] = await Promise.all([
      this.bills.listBills(cafeId, { unpaid: true }),
      this.store.listChecks(cafeId),
      this.store.listLoans(cafeId),
      this.store.listRepayments(cafeId),
      this.bills.listSuppliers(cafeId, { includeArchived: true }),
      canCard ? this.store.getCard(cafeId) : null,
    ]);
    const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
    const loanBills = await this.billsOf(cafeId, loans);
    const names = await this.names([...checks.map((c) => c.cashedById), ...repayments.map((r) => r.memberId)]);
    const cashedSince = this.daysAgo(today, CASHED_DAYS);
    const checkBills = new Map<string, string>();
    for (const c of checks) {
      const payment = c.billPaymentId && (!c.cashedOn || c.cashedOn >= cashedSince) ? await this.bills.getPayment(cafeId, c.billPaymentId) : null;
      if (payment) checkBills.set(c.id, payment.billId);
    }
    const checkDtos = checks
      .filter((c) => !c.cashedOn || c.cashedOn >= cashedSince)
      .map((c) => ({ ...checkDto(c, supplierNames, names, today), billId: checkBills.get(c.id) ?? null }))
      .sort((a, b) => Number(a.state === "cashed") - Number(b.state === "cashed") || (a.state === "cashed" ? b.cashedOn!.localeCompare(a.cashedOn!) : 0));
    const lenders = this.lenders(loans, repayments, loanBills, supplierNames, names, today);
    const card = cardSettings ? await this.card(cafeId, cardSettings, today, supplierNames, names) : null;
    const wages = permissions.has("pay.hours") || permissions.has("pay.payouts") ? await this.wages(cafeId, today) : [];

    const rows: DebtRowDTO[] = [
      ...owedBills.map((b) => ({
        kind: "bill" as const,
        id: b.id,
        name: (b.supplierId && supplierNames.get(b.supplierId)) || b.lines[0]?.name || "Fatura",
        detail: b.lines.map((l) => l.name).join(", "),
        amountKurus: b.totalKurus - b.paidKurus,
        dueDate: b.dueDate,
        overdue: billState(b, today) === "overdue",
      })),
      ...checkDtos
        .filter((c) => c.state !== "cashed")
        .map((c) => ({
          kind: "check" as const,
          id: c.id,
          name: c.payee,
          detail: [c.bankName, `No ${c.number}`].filter(Boolean).join(" · "),
          amountKurus: c.amountKurus,
          dueDate: c.dueDate,
          overdue: c.state === "due" && c.dueDate < today,
        })),
      ...lenders
        .filter((l) => l.owedKurus > 0)
        .map((l) => ({
          kind: "loan" as const,
          id: l.key,
          name: l.name,
          detail:
            l.loans
              .filter((x) => x.leftKurus > 0)
              .map((x) => x.billName ?? x.note ?? null)
              .filter(Boolean)
              .join(", ") || null,
          amountKurus: l.owedKurus,
          dueDate: l.dueDate,
          overdue: !!l.dueDate && l.dueDate < today,
        })),
      ...(card && card.balanceKurus > 0
        ? [
            {
              kind: "card" as const,
              id: "card",
              name: card.name,
              detail: null,
              amountKurus: card.balanceKurus,
              dueDate: card.statementKurus > 0 ? card.dueDate : null,
              overdue: card.overdueKurus > 0,
            },
          ]
        : []),
      ...wages,
    ].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.amountKurus - a.amountKurus);

    const weekEnd = this.daysAgo(today, -7);
    let overdueKurus = 0;
    let weekKurus = 0;
    const soon = (day: string | null) => !!day && day >= today && day <= weekEnd;
    for (const r of rows) {
      if (r.kind === "card") {
        // The card's late part is overdue; the rest of its statement falls due on its day.
        overdueKurus += card!.overdueKurus;
        if (soon(r.dueDate)) weekKurus += card!.statementKurus - card!.overdueKurus;
      } else if (r.kind === "loan") {
        // Only the loans that have a date count towards when.
        for (const l of lenders.find((x) => x.key === r.id)!.loans) {
          if (l.dueDate && l.dueDate < today) overdueKurus += l.leftKurus;
          else if (soon(l.dueDate)) weekKurus += l.leftKurus;
        }
      } else if (r.overdue) overdueKurus += r.amountKurus;
      else if (soon(r.dueDate)) weekKurus += r.amountKurus;
    }
    return {
      today,
      rows,
      totals: { totalKurus: rows.reduce((s, r) => s + r.amountKurus, 0), overdueKurus, weekKurus },
      checks: checkDtos,
      lenders,
      card,
      cardNotSet: canCard && !cardSettings,
      team: await this.billService.team(cafeId),
      suppliers: suppliers.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name })),
      canEdit: permissions.has("debts.edit"),
      canCard,
      canPayBills: permissions.has("bills.manage"),
      cashFrom: await this.money.cashFrom(cafeId, permissions),
      closedThrough: await this.money.closedThrough(cafeId),
    };
  }

  // ─────────────────────────────────────────────── checks

  /** A check written on its own (for a bill that isn't in Peni). The same `key` twice adds one. */
  async addCheck(ctx: StaffContext, input: CheckInput): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const cafeId = ctx.cafe.id;
    const id = `chk_${keyHash(cafeId, input.key)}`;
    if (await this.store.getCheck(cafeId, id)) return this.get(ctx);
    const today = await this.today(cafeId);
    const number = input.number.trim();
    if (!number || number.length > 30) throw new AppError("CHECK_NUMBER_REQUIRED", "Type the check's number", 400);
    this.amount(input.amountKurus);
    const writtenOn = input.writtenOn ?? today;
    this.day(writtenOn, today);
    await this.money.assertOpen(cafeId, writtenOn);
    if (!validDate(input.dueDate) || input.dueDate < writtenOn)
      throw new AppError("CHECK_DUE_INVALID", "The check's date is before the day it was written", 400);
    const supplier = input.supplierId ? await this.bills.getSupplier(cafeId, input.supplierId) : null;
    if (input.supplierId && !supplier) throw new AppError("SUPPLIER_NOT_FOUND", "No such supplier", 404);
    const payee = input.payee?.trim() || null;
    if (!payee && !supplier) throw new AppError("PAYEE_REQUIRED", "Who is it written to?", 400);
    await this.store.saveCheck({
      id,
      cafeId,
      number,
      bankName: input.bankName?.trim() || null,
      payee,
      supplierId: supplier?.id ?? null,
      amountKurus: input.amountKurus,
      writtenOn,
      dueDate: input.dueDate,
      note: input.note?.trim() || null,
      billPaymentId: null,
      cashedOn: null,
      cashedById: null,
      createdById: ctx.member.id,
      createdAt: this.now(),
    });
    return this.get(ctx);
  }

  /** "Tahsil edildi": the bank paid it out, so it is no longer owed. `cashed: false` undoes it. */
  async cashCheck(ctx: StaffContext, checkId: string, input: { cashed: boolean; cashedOn?: string }): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const check = await this.check(ctx, checkId);
    const label = `Çek · ${check.number}`;
    if (!input.cashed) {
      if (!check.cashedOn) return this.get(ctx);
      await this.money.assertOpen(ctx.cafe.id, check.cashedOn);
      await this.atomically(async () => {
        await this.money.unpost(ctx, `check:${check.id}`, label);
        await this.store.saveCheck({ ...check, cashedOn: null, cashedById: null });
      });
      return this.get(ctx);
    }
    if (check.cashedOn) return this.get(ctx);
    const today = await this.today(ctx.cafe.id);
    const cashedOn = input.cashedOn ?? today;
    if (!validDate(cashedOn) || cashedOn > today || cashedOn < check.writtenOn) throw new AppError("CASHED_ON_INVALID", "Check the day it was cashed", 400);
    await this.money.assertOpen(ctx.cafe.id, cashedOn);
    // The bank paid it out: that day, the money leaves the bank.
    await this.atomically(async () => {
      const account = await this.money.accountFor(ctx, "bank", undefined, cashedOn);
      await this.money.post(ctx, { source: `check:${check.id}`, account, amountKurus: -check.amountKurus, kind: "check", day: cashedOn, label });
      await this.store.saveCheck({ ...check, cashedOn, cashedById: ctx.member.id });
    });
    return this.get(ctx);
  }

  /** "Sil": a check typed by mistake. A bill's check goes when that payment is undone. */
  async removeCheck(ctx: StaffContext, checkId: string): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const check = await this.check(ctx, checkId);
    if (check.billPaymentId) throw new AppError("CHECK_FROM_BILL", "Undo the bill's payment instead", 409);
    if (check.cashedOn) throw new AppError("CHECK_CASHED", "The check was cashed", 409);
    await this.money.assertOpen(ctx.cafe.id, check.writtenOn);
    await this.store.removeCheck(ctx.cafe.id, checkId);
    return this.get(ctx);
  }

  // ─────────────────────────────────────────────── loans

  /** Money someone put in (not for a bill in Peni). The same `key` twice adds one. */
  async addLoan(ctx: StaffContext, input: LoanInput): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const cafeId = ctx.cafe.id;
    const id = `lon_${keyHash(cafeId, input.key)}`;
    if (await this.store.getLoan(cafeId, id)) return this.get(ctx);
    const today = await this.today(cafeId);
    this.amount(input.amountKurus);
    const borrowedOn = input.borrowedOn ?? today;
    this.day(borrowedOn, today);
    await this.money.assertOpen(cafeId, borrowedOn);
    const dueDate = input.dueDate || null;
    if (dueDate && (!validDate(dueDate) || dueDate < borrowedOn)) throw new AppError("LOAN_DUE_INVALID", "It can't be due before it was lent", 400);
    const lender = await this.billService.lender(ctx, input.lender);
    await this.store.saveLoan({
      id,
      cafeId,
      ...lender,
      amountKurus: input.amountKurus,
      borrowedOn,
      dueDate,
      note: input.note?.trim() || null,
      billPaymentId: null,
      createdById: ctx.member.id,
      createdAt: this.now(),
    });
    return this.get(ctx);
  }

  /** "Sil": a loan typed by mistake, if what was paid back still fits in what is left. */
  async removeLoan(ctx: StaffContext, loanId: string): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const cafeId = ctx.cafe.id;
    await this.atomically(async () => {
      const loan = await this.store.getLoan(cafeId, loanId);
      if (!loan) throw new AppError("LOAN_NOT_FOUND", "No such loan", 404);
      if (loan.billPaymentId) throw new AppError("LOAN_FROM_BILL", "Undo the bill's payment instead", 409);
      await this.money.assertOpen(cafeId, loan.borrowedOn);
      const { borrowed, repaid } = await this.lenderTotals(cafeId, loan.lenderKey);
      if (repaid > borrowed - loan.amountKurus) throw new AppError("LOAN_REPAID", "Some of it was paid back", 409);
      await this.store.removeLoan(cafeId, loanId);
    });
    return this.get(ctx);
  }

  /** "Geri öde": pays the lender's oldest loans first. Not more than they are owed. */
  async repay(ctx: StaffContext, input: { key: string; lender: string; amountKurus: number; method: MoneyMethod; paidOn?: string; from?: "drawer" | "reserve" }): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const cafeId = ctx.cafe.id;
    const id = `lrp_${keyHash(cafeId, input.key)}`;
    const today = await this.today(cafeId);
    this.amount(input.amountKurus);
    const paidOn = input.paidOn ?? today;
    this.day(paidOn, today);
    await this.atomically(async () => {
      if (await this.store.getRepayment(cafeId, id)) return;
      const { borrowed, repaid } = await this.lenderTotals(cafeId, input.lender);
      if (borrowed === 0) throw new AppError("LENDER_NOT_FOUND", "Nothing is owed to them", 404);
      if (input.amountKurus > borrowed - repaid) throw new AppError("LOAN_OVERPAY", "That's more than they are owed", 409);
      await this.money.assertOpen(cafeId, paidOn);
      const account = await this.money.accountFor(ctx, input.method, input.from, paidOn);
      const name = (await this.store.listLoans(cafeId, { lenderKey: input.lender }))[0]?.lenderName;
      await this.money.post(ctx, { source: `repayment:${id}`, account, amountKurus: -input.amountKurus, kind: "repayment", day: paidOn, label: `Borç ödemesi · ${name}` });
      await this.store.addRepayment({
        id,
        cafeId,
        lenderKey: input.lender,
        amountKurus: input.amountKurus,
        method: input.method,
        paidOn,
        account,
        memberId: ctx.member.id,
        createdAt: this.now(),
      });
    });
    return this.get(ctx);
  }

  async removeRepayment(ctx: StaffContext, repaymentId: string): Promise<DebtsDTO> {
    this.require(ctx, "debts.edit");
    const cafeId = ctx.cafe.id;
    const repayment = await this.store.getRepayment(cafeId, repaymentId);
    if (!repayment) throw new AppError("REPAYMENT_NOT_FOUND", "No such repayment", 404);
    await this.money.assertOpen(cafeId, repayment.paidOn);
    const name = (await this.store.listLoans(cafeId, { lenderKey: repayment.lenderKey }))[0]?.lenderName;
    await this.atomically(async () => {
      await this.money.unpost(ctx, `repayment:${repaymentId}`, `Borç ödemesi · ${name}`);
      await this.store.removeRepayment(cafeId, repaymentId);
    });
    return this.get(ctx);
  }

  // ─────────────────────────────────────────────── the credit card

  /** The card's name, limit and days. Changing the days changes how its statements are worked out from now on. */
  async setCard(ctx: StaffContext, input: { name: string; limitKurus: number; statementDay: number; dueDay: number }): Promise<DebtsDTO> {
    this.require(ctx, "debts.card");
    const name = input.name.trim();
    const day = (d: number) => Number.isInteger(d) && d >= 1 && d <= 28;
    if (!name || name.length > 80 || !Number.isInteger(input.limitKurus) || input.limitKurus < 0 || !day(input.statementDay) || !day(input.dueDay)) {
      throw new AppError("CARD_SETTINGS_INVALID", "Check the card's details", 400);
    }
    await this.store.saveCard({
      cafeId: ctx.cafe.id,
      name,
      limitKurus: input.limitKurus,
      statementDay: input.statementDay,
      dueDay: input.dueDay,
      updatedAt: this.now(),
    });
    return this.get(ctx);
  }

  /** "Karta ödeme": cash or a transfer, not more than the card owes. */
  async payCard(ctx: StaffContext, input: { key: string; amountKurus: number; method: "cash" | "bank"; paidOn?: string; from?: "drawer" | "reserve" }): Promise<DebtsDTO> {
    this.require(ctx, "debts.card");
    const cafeId = ctx.cafe.id;
    const id = `cpy_${keyHash(cafeId, input.key)}`;
    const today = await this.today(cafeId);
    this.amount(input.amountKurus);
    const paidOn = input.paidOn ?? today;
    this.day(paidOn, today);
    await this.atomically(async () => {
      if (await this.store.getCardPayment(cafeId, id)) return;
      const card = await this.store.getCard(cafeId);
      if (!card) throw new AppError("CARD_NOT_SET", "Set up the credit card first", 409);
      const [charges, payments] = await Promise.all([this.bills.listPayments(cafeId, { method: "credit" }), this.store.listCardPayments(cafeId)]);
      if (input.amountKurus > cardStatement(card, charges, payments, today).balanceKurus)
        throw new AppError("CARD_OVERPAY", "That's more than the card owes", 409);
      await this.money.assertOpen(cafeId, paidOn);
      const account = await this.money.accountFor(ctx, input.method, input.from, paidOn);
      await this.money.post(ctx, { source: `card_payment:${id}`, account, amountKurus: -input.amountKurus, kind: "card", day: paidOn, label: `Kredi kartı · ${card.name}` });
      await this.store.addCardPayment({
        id,
        cafeId,
        amountKurus: input.amountKurus,
        method: input.method,
        paidOn,
        account,
        memberId: ctx.member.id,
        createdAt: this.now(),
      });
    });
    return this.get(ctx);
  }

  async removeCardPayment(ctx: StaffContext, paymentId: string): Promise<DebtsDTO> {
    this.require(ctx, "debts.card");
    const cafeId = ctx.cafe.id;
    const payment = await this.store.getCardPayment(cafeId, paymentId);
    if (!payment) throw new AppError("PAYMENT_NOT_FOUND", "No such payment", 404);
    await this.money.assertOpen(cafeId, payment.paidOn);
    const card = await this.store.getCard(cafeId);
    await this.atomically(async () => {
      await this.money.unpost(ctx, `card_payment:${paymentId}`, `Kredi kartı · ${card?.name ?? ""}`);
      await this.store.removeCardPayment(cafeId, paymentId);
    });
    return this.get(ctx);
  }

  // ─────────────────────────────────────────────── helpers

  /** Pay still owed to each person (Puantaj ve maaş), with the months it is for. */
  private async wages(cafeId: string, today: string): Promise<DebtRowDTO[]> {
    const [days, rates, payouts] = await Promise.all([this.shifts.listWorkDays(cafeId, "0000-01-01", today), this.shifts.listRates(cafeId), this.shifts.listPayouts(cafeId)]);
    const owed = owedByMonth(days, rates, payouts);
    const names = await this.names([...owed.keys()]);
    const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("tr-TR", { month: "long", timeZone: "UTC" });
    return [...owed].map(([memberId, months]) => ({
      kind: "wages" as const,
      id: memberId,
      name: names.get(memberId) ?? "",
      detail: [...months.keys()].sort().map(monthName).join(", "),
      amountKurus: [...months.values()].reduce((s, k) => s + k, 0),
      dueDate: null,
      overdue: false,
    }));
  }

  private lenders(
    loans: Loan[],
    repayments: { id: string; lenderKey: string; amountKurus: number; method: MoneyMethod; paidOn: string; memberId: string; account: MoneyAccount | null }[],
    loanBills: Map<string, Bill>,
    supplierNames: Map<string, string>,
    names: Map<string, string>,
    today: string,
  ): LenderDTO[] {
    const keys = [...new Set(loans.map((l) => l.lenderKey))];
    return keys
      .map((key) => {
        const mine = loans.filter((l) => l.lenderKey === key);
        const paid = repayments.filter((r) => r.lenderKey === key);
        const repaidKurus = paid.reduce((s, r) => s + r.amountKurus, 0);
        const borrowedKurus = mine.reduce((s, l) => s + l.amountKurus, 0);
        const left = loansLeft(mine, repaidKurus);
        const first = mine[0]!;
        return {
          key,
          name: first.lenderName,
          memberId: first.lenderMemberId,
          owedKurus: borrowedKurus - repaidKurus,
          borrowedKurus,
          repaidKurus,
          dueDate:
            left
              .filter((l) => l.leftKurus > 0 && l.dueDate)
              .map((l) => l.dueDate!)
              .sort()[0] ?? null,
          loans: left.map((l) => {
            const bill = l.billPaymentId ? loanBills.get(l.id) : undefined;
            // Taking a loan away can't leave more paid back than was lent.
            const removable = !l.billPaymentId && repaidKurus <= borrowedKurus - l.amountKurus;
            return {
              id: l.id,
              amountKurus: l.amountKurus,
              leftKurus: l.leftKurus,
              borrowedOn: l.borrowedOn,
              dueDate: l.dueDate,
              note: l.note,
              billId: bill?.id ?? null,
              billName: bill ? [(bill.supplierId && supplierNames.get(bill.supplierId)) || null, bill.lines[0]?.name].filter(Boolean).join(" · ") : null,
              removable,
            };
          }),
          repayments: [...paid]
            .reverse()
            .map((r) => ({ id: r.id, amountKurus: r.amountKurus, method: r.method, paidOn: r.paidOn, by: names.get(r.memberId) ?? null, account: r.account })),
        } satisfies LenderDTO;
      })
      .sort((a, b) => b.owedKurus - a.owedKurus || a.name.localeCompare(b.name, "tr"));
  }

  private async card(
    cafeId: string,
    settings: NonNullable<Awaited<ReturnType<DebtStore["getCard"]>>>,
    today: string,
    supplierNames: Map<string, string>,
    names: Map<string, string>,
  ): Promise<CardDTO> {
    const [charges, payments] = await Promise.all([this.bills.listPayments(cafeId, { method: "credit" }), this.store.listCardPayments(cafeId)]);
    const statement = cardStatement(settings, charges, payments, today);
    const recent = charges.slice(-CARD_CHARGES).reverse();
    const bills = new Map((await Promise.all(recent.map((c) => this.bills.getBill(cafeId, c.billId)))).filter((b): b is Bill => !!b).map((b) => [b.id, b]));
    const payers = await this.names(payments.map((p) => p.memberId));
    for (const [k, v] of payers) names.set(k, v);
    return {
      name: settings.name,
      limitKurus: settings.limitKurus,
      statementDay: settings.statementDay,
      dueDay: settings.dueDay,
      ...statement,
      charges: recent.map((c) => {
        const bill = bills.get(c.billId);
        return {
          paymentId: c.id,
          billId: c.billId,
          name: (bill?.supplierId && supplierNames.get(bill.supplierId)) || bill?.lines[0]?.name || "Fatura",
          amountKurus: c.amountKurus,
          paidOn: c.paidOn,
        };
      }),
      payments: [...payments]
        .reverse()
        .map((p) => ({ id: p.id, amountKurus: p.amountKurus, method: p.method, paidOn: p.paidOn, by: names.get(p.memberId) ?? null, account: p.account })),
    };
  }

  /** The bill behind each loan that paid one, by loan id. */
  private async billsOf(cafeId: string, loans: Loan[]): Promise<Map<string, Bill>> {
    const out = new Map<string, Bill>();
    for (const l of loans) {
      if (!l.billPaymentId) continue;
      const payment = await this.bills.getPayment(cafeId, l.billPaymentId);
      const bill = payment && (await this.bills.getBill(cafeId, payment.billId));
      if (bill) out.set(l.id, bill);
    }
    return out;
  }

  private async lenderTotals(cafeId: string, key: string): Promise<{ borrowed: number; repaid: number }> {
    const [loans, repayments] = await Promise.all([this.store.listLoans(cafeId, { lenderKey: key }), this.store.listRepayments(cafeId, { lenderKey: key })]);
    return { borrowed: loans.reduce((s, l) => s + l.amountKurus, 0), repaid: repayments.reduce((s, r) => s + r.amountKurus, 0) };
  }

  private async check(ctx: StaffContext, checkId: string): Promise<Check> {
    const check = await this.store.getCheck(ctx.cafe.id, checkId);
    if (!check) throw new AppError("CHECK_NOT_FOUND", "No such check", 404);
    return check;
  }

  private amount(kurus: number): void {
    if (!Number.isInteger(kurus) || kurus <= 0 || kurus > 100_000_000) throw new AppError("AMOUNT_INVALID", "Check the amount", 400);
  }

  private day(day: string, today: string): void {
    if (!validDate(day) || day > today) throw new AppError("DATE_INVALID", "Check the date", 400);
  }

  private daysAgo(today: string, days: number): string {
    return new Date(Date.parse(`${today}T12:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
  }

  private async today(cafeId: string): Promise<string> {
    return localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
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

function checkDto(c: Check, supplierNames: Map<string, string>, names: Map<string, string>, today: string): CheckDTO {
  return {
    id: c.id,
    number: c.number,
    bankName: c.bankName,
    payee: c.payee ?? (c.supplierId ? supplierNames.get(c.supplierId) : undefined) ?? "",
    amountKurus: c.amountKurus,
    writtenOn: c.writtenOn,
    dueDate: c.dueDate,
    note: c.note,
    billId: null,
    cashedOn: c.cashedOn,
    cashedBy: c.cashedById ? (names.get(c.cashedById) ?? null) : null,
    state: c.cashedOn ? "cashed" : c.dueDate <= today ? "due" : "open",
    removable: !c.billPaymentId && !c.cashedOn,
  };
}
