import type { ReadStatement, ReadZ, StatementReading, ZReading } from "@peni/ai";
import type { CheckOutcomeDTO, StatementCheckDTO, StatementRecordDTO, ZCheckDTO } from "@peni/api";
import {
  addDays,
  CHECK_NOTE_MAX,
  compareZ,
  dayDiff,
  localDateKey,
  matchStatement,
  SALES_DAYS,
  startOfLocalDay,
  zDiffers,
  type AssistantStore,
  type BillStore,
  type CheckOutcome,
  type DebtStore,
  type DuplicateRef,
  type PaymentStore,
  type PeniDirectory,
  type StatementDraft,
  type StatementProposal,
  type StatementRecord,
  type TillDay,
  type ZReportDraft,
  type ZReportProposal,
} from "@peni/core";
import { formatTL } from "@peni/brand/format";
import { receiptPdf } from "./demo-receipt";
import { AppError } from "./errors";
import type { MoneyService } from "./money";
import type { StaffContext } from "./staff";

/** Records this many days either side of a statement's own days can still match its lines. */
const EDGE_DAYS = 7;

/**
 * Bank and card statements (A5) and Z reports (A6), plan piece 27. The assistant reads
 * them like bills (AssistantService does the reading); here they're set beside what Peni
 * has, every time the draft is looked at, so a bill entered after the upload matches too.
 * Saying it's checked keeps what was seen; it changes nothing else, unless the person asks
 * for Peni's bank balance to be set to the statement's.
 */
export class ChecksService {
  constructor(
    private readonly store: AssistantStore,
    private readonly money: MoneyService,
    private readonly payments: PaymentStore,
    private readonly bills: BillStore,
    private readonly debts: DebtStore,
    private readonly directory: PeniDirectory,
    private readonly now: () => Date,
  ) {}

  // ─────────────────────────────────────────────── from a reading to a draft

  statementProposal(read: ReadStatement): StatementProposal {
    const { doubts: _doubts, ...proposal } = read;
    return proposal;
  }

  zProposal(read: ReadZ): ZReportProposal {
    const { doubts: _doubts, ...proposal } = read;
    return proposal;
  }

  statementTitle(p: StatementProposal): string {
    const what = p.account === "card" ? "Kart ekstresi" : "Banka ekstresi";
    const who = [p.bankName, p.accountHint && `…${p.accountHint.slice(-4)}`].filter(Boolean).join(" ");
    return [who ? `${what} · ${who}` : what, p.from && p.to ? `${trDay(p.from)}–${trDay(p.to)}` : null].filter(Boolean).join(" · ").slice(0, 120);
  }

  zTitle(p: ZReportProposal): string {
    return ["Z raporu", p.date ? trDay(p.date) : null, p.totalKurus !== null ? formatTL(p.totalKurus) : null].filter(Boolean).join(" · ").slice(0, 120);
  }

  /** The same statement read before: same account and days; or the same Z report: same number, else same day. */
  async duplicate(cafeId: string, kind: "statement" | "zreport", proposal: StatementProposal | ZReportProposal, self: string): Promise<DuplicateRef | null> {
    const drafts = (await this.store.listDrafts(cafeId, { limit: 300 })).filter((d) => d.id !== self && d.status !== "dismissed" && d.kind === kind);
    for (const d of drafts) {
      if (d.kind === "statement" && kind === "statement") {
        const p = proposal as StatementProposal;
        const q = d.proposal;
        if (p.account === q.account && p.from && p.from === q.from && p.to === q.to && (p.accountHint ?? "") === (q.accountHint ?? ""))
          return { kind: "draft", id: d.id, title: d.title, why: "dayTotal" };
      }
      if (d.kind === "zreport" && kind === "zreport") {
        const p = proposal as ZReportProposal;
        const q = d.proposal;
        if (p.zNumber && q.zNumber && p.zNumber.replace(/^0+/, "") === q.zNumber.replace(/^0+/, ""))
          return { kind: "draft", id: d.id, title: d.title, why: "number" };
        if (p.date && p.date === q.date) return { kind: "draft", id: d.id, title: d.title, why: "dayTotal" };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────── looking at it

  /** A statement beside Peni's records for its days. */
  async statement(ctx: StaffContext, p: StatementProposal): Promise<StatementCheckDTO> {
    const cafeId = ctx.cafe.id;
    const from = p.from ?? p.lines.map((l) => l.date).sort()[0] ?? null;
    const to =
      p.to ??
      p.lines
        .map((l) => l.date)
        .sort()
        .at(-1) ??
      null;
    const base: StatementCheckDTO = {
      account: p.account,
      bankName: p.bankName,
      accountHint: p.accountHint,
      from,
      to,
      openingKurus: p.openingKurus,
      closingKurus: p.closingKurus,
      lines: p.lines.map((l) => ({ ...l, match: null })),
      missing: [],
      inTransitKurus: 0,
      followed: false,
      peniBalanceKurus: null,
      differenceKurus: null,
      feesKurus: 0,
      canFix: false,
    };
    if (!from || !to) return base;
    const records = p.account === "bank" ? await this.money.bankRecords(cafeId, shift(from, -EDGE_DAYS), shift(to, EDGE_DAYS)) : await this.cardRecords(cafeId);
    if (!records) return base;
    const { matches, unmatched } = matchStatement(p.lines, records, p.account);
    // Card sales of the last days before the statement ends may reach the bank after it.
    const transit = unmatched.filter((r) => r.kind === "sales" && r.amountKurus > 0 && r.day <= to && dayDiff(r.day, to) < SALES_DAYS);
    const inTransitKurus = transit.reduce((sum, r) => sum + r.amountKurus, 0);
    const balance = p.account === "bank" ? await this.money.bankBalanceThrough(cafeId, to) : await this.cardOwedThrough(cafeId, to);
    const peniBalanceKurus = balance === null ? null : balance - inTransitKurus;
    // A card statement asks for what is owed: Peni's debt, which is a balance below zero.
    const statementBalance = p.closingKurus === null ? null : p.account === "card" ? -Math.abs(p.closingKurus) : p.closingKurus;
    const differenceKurus = statementBalance !== null && peniBalanceKurus !== null ? statementBalance - peniBalanceKurus : null;
    const closed = await this.money.closedThrough(cafeId);
    const today = localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
    return {
      ...base,
      lines: p.lines.map((l, i) => {
        const m = matches[i];
        return {
          ...l,
          match: m
            ? {
                kind: m.kind as StatementRecordDTO["kind"],
                label: m.label,
                day: m.day,
                amountKurus: m.amountKurus,
                billId: m.billId,
                days: m.recordIds.length,
                feeKurus: m.feeKurus,
              }
            : null,
        };
      }),
      missing: unmatched.filter((r) => r.day >= from && r.day <= to && !transit.includes(r)).map(recordDto),
      inTransitKurus,
      followed: true,
      peniBalanceKurus,
      differenceKurus,
      feesKurus: matches.reduce((s, m) => s + (m?.feeKurus ?? 0), 0),
      canFix: p.account === "bank" && !!differenceKurus && ctx.permissions.has("cash.manage") && (!closed || closed < today),
    };
  }

  /** A Z report beside the till's own day. */
  async zreport(ctx: StaffContext, p: ZReportProposal): Promise<ZCheckDTO> {
    const till = p.date ? await this.tillDay(ctx.cafe.id, p.date) : { cashKurus: 0, cardKurus: 0, peniKurus: 0, askiKurus: 0, payments: 0 };
    const rows = compareZ(p, till);
    return {
      date: p.date,
      zNumber: p.zNumber,
      receipts: p.receipts,
      refundsKurus: p.refundsKurus,
      otherKurus: p.otherKurus,
      kdv: p.kdv,
      rows,
      till: { peniKurus: till.peniKurus, askiKurus: till.askiKurus, payments: till.payments },
      differs: rows.some(zDiffers),
    };
  }

  // ─────────────────────────────────────────────── saying it's checked

  /**
   * What the person saw when saying it's checked. A Z report that doesn't agree with the
   * till needs a note on why. `fixBalance` sets Peni's bank balance to the statement's.
   * Needs "cash.manage".
   */
  async check(ctx: StaffContext, draft: StatementDraft | ZReportDraft, input: { note?: string | null; fixBalance?: boolean }): Promise<CheckOutcome> {
    this.require(ctx);
    const note = input.note?.trim().slice(0, CHECK_NOTE_MAX) || null;
    if (draft.kind === "zreport") {
      const z = await this.zreport(ctx, draft.proposal);
      if (z.differs && !note) throw new AppError("CHECK_NOTE_REQUIRED", "Write why the Z report and the till differ", 400);
      const total = z.rows.find((r) => r.key === "total")!;
      return {
        note,
        matched: z.rows.filter((r) => r.differenceKurus !== null && !zDiffers(r)).length,
        unmatched: z.rows.filter(zDiffers).length,
        differenceKurus: total.differenceKurus,
        correctionKurus: null,
      };
    }
    const s = await this.statement(ctx, draft.proposal);
    let correctionKurus: number | null = null;
    if (input.fixBalance) {
      if (!s.canFix || s.differenceKurus === null) throw new AppError("CHECK_CANT_FIX", "Peni's bank balance can't be set from this statement", 409);
      const why = `${[s.bankName, s.to && trDay(s.to)].filter(Boolean).join(" ")} ekstresine göre`.trim();
      await this.money.correctBank(ctx, `statement:${draft.id}`, s.differenceKurus, note ? `${why}: ${note}` : why);
      correctionKurus = s.differenceKurus;
    }
    const matched = s.lines.filter((l) => l.match).length;
    return { note, matched, unmatched: s.lines.length - matched, differenceKurus: s.differenceKurus, correctionKurus };
  }

  // ─────────────────────────────────────────────── Peni's side

  /** The credit card's charges (bills paid by card) and the payments towards it. */
  private async cardRecords(cafeId: string): Promise<StatementRecord[]> {
    const [charges, payments, suppliers] = await Promise.all([
      this.bills.listPayments(cafeId, { method: "credit" }),
      this.debts.listCardPayments(cafeId),
      this.bills.listSuppliers(cafeId, { includeArchived: true }),
    ]);
    const names = new Map(suppliers.map((s) => [s.id, s.name]));
    const out: StatementRecord[] = [];
    for (const c of charges) {
      const bill = await this.bills.getBill(cafeId, c.billId);
      out.push({
        id: `charge:${c.id}`,
        day: c.paidOn,
        amountKurus: -c.amountKurus,
        kind: "charge",
        label: (bill?.supplierId && names.get(bill.supplierId)) || bill?.lines[0]?.name || null,
        billId: c.billId,
      });
    }
    for (const p of payments)
      out.push({ id: `card_payment:${p.id}`, day: p.paidOn, amountKurus: p.amountKurus, kind: "cardPayment", label: null, billId: null });
    return out;
  }

  /** What Peni says was owed on the card at the end of a day, as a balance (below zero when owed). */
  private async cardOwedThrough(cafeId: string, day: string): Promise<number | null> {
    const [charges, payments] = await Promise.all([this.bills.listPayments(cafeId, { method: "credit" }), this.debts.listCardPayments(cafeId)]);
    if (!charges.length && !payments.length && !(await this.debts.getCard(cafeId))) return null;
    const sum = (xs: { amountKurus: number; paidOn: string }[]) => xs.filter((x) => x.paidOn <= day).reduce((s, x) => s + x.amountKurus, 0);
    return sum(payments) - sum(charges);
  }

  /** What the till took on a day, by how it was paid, refunds taken off. */
  async tillDay(cafeId: string, day: string): Promise<TillDay> {
    const tz = (await this.directory.getSettings(cafeId)).timeZone;
    const from = startOfLocalDay(new Date(`${day}T12:00:00Z`), tz);
    const to = startOfLocalDay(addDays(new Date(`${day}T12:00:00Z`), 1), tz);
    const out: TillDay = { cashKurus: 0, cardKurus: 0, peniKurus: 0, askiKurus: 0, payments: 0 };
    for (const p of await this.payments.listSettled(cafeId, from, to)) {
      const amount = p.kind === "sale" ? p.amountKurus : -p.amountKurus;
      if (p.method === "cash") out.cashKurus += amount;
      else if (p.method === "card") out.cardKurus += amount;
      else if (p.method === "peni") out.peniKurus += amount;
      else out.askiKurus += amount;
      if (p.kind === "sale" && (p.method === "cash" || p.method === "card")) out.payments++;
    }
    return out;
  }

  // ─────────────────────────────────────────────── the demo

  /**
   * The demo's stand-in for reading a statement: the café's own bank (or card) records of
   * the last days, as a bank would print them. Card sales come in the next day less 1.8%,
   * the weekend's on Monday; and two lines Peni doesn't have, a fee and an SGK payment.
   */
  async demoStatement(cafeId: string, account: "bank" | "card"): Promise<StatementReading> {
    const today = localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone);
    const to = shift(today, -1);
    const from = shift(today, account === "bank" ? -10 : -30);
    const lines: StatementReading["lines"] = [];
    const tl = (k: number) => k / 100;
    if (account === "bank") {
      const records = (await this.money.bankRecords(cafeId, from, to)) ?? [];
      let pending = 0;
      for (const r of [...records].sort((a, b) => a.day.localeCompare(b.day))) {
        if (r.kind === "sales") {
          if (r.amountKurus <= 0) continue;
          // Saturday's sales wait for Sunday's; both come in on Monday.
          pending += r.amountKurus;
          const weekday = new Date(`${r.day}T12:00:00Z`).getUTCDay();
          if (weekday === 6) continue;
          const paid = shift(r.day, 1);
          if (paid > to) continue;
          lines.push({
            date: paid,
            description: "POS ÜYE İŞYERİ TAHSİLAT",
            amount: tl(pending - Math.round(pending * 0.018)),
            balance: null,
            kind: "cardSales",
          });
          pending = 0;
          continue;
        }
        const description =
          r.kind === "wages"
            ? `MAAŞ ÖDEMESİ ${r.label ?? ""}`
            : r.kind === "card"
              ? "KREDİ KARTI ÖDEMESİ"
              : r.kind === "check"
                ? `ÇEK ÖDEMESİ ${r.label ?? ""}`
                : r.kind === "transfer" || r.kind === "deposit"
                  ? "NAKİT YATIRMA"
                  : r.kind === "withdraw"
                    ? "NAKİT ÇEKME"
                    : `EFT ${r.label ?? ""}`;
        const kind = r.kind === "wages" ? "wages" : r.kind === "card" ? "cardPayment" : r.kind === "check" ? "check" : r.kind === "bill" ? "supplier" : "cash";
        lines.push({ date: r.day, description: description.trim().toLocaleUpperCase("tr-TR"), amount: tl(r.amountKurus), balance: null, kind });
      }
      lines.push({ date: shift(to, -3), description: "SGK PRİM ÖDEMESİ", amount: -8_450, balance: null, kind: "tax" });
      lines.push({ date: to, description: "HESAP İŞLETİM ÜCRETİ", amount: -47.5, balance: null, kind: "fee" });
      lines.sort((a, b) => a.date.localeCompare(b.date));
      const opening = (await this.money.bankBalanceThrough(cafeId, shift(from, -1))) ?? 0;
      let balance = opening;
      for (const l of lines) {
        balance += Math.round(l.amount * 100);
        l.balance = tl(balance);
      }
      return {
        isStatement: true,
        account,
        bankName: "Garanti BBVA",
        accountHint: "4471",
        from,
        to,
        opening: tl(opening),
        closing: tl(balance),
        lines,
        doubts: ["Demo: ekstre gerçekten okunmadı; satırlar kafenin kendi kayıtlarından yazıldı."],
      };
    }
    const records = (await this.cardRecords(cafeId)).filter((r) => r.day >= from && r.day <= to);
    for (const r of records)
      lines.push({
        date: r.kind === "charge" ? r.day : shift(r.day, 1),
        description: r.kind === "charge" ? (r.label ?? "ALIŞVERİŞ").toLocaleUpperCase("tr-TR") : "HESAPTAN ÖDEME",
        amount: tl(r.amountKurus),
        balance: null,
        kind: r.kind === "charge" ? "supplier" : "cardPayment",
      });
    lines.push({ date: shift(to, -6), description: "GOOGLE WORKSPACE", amount: -252, balance: null, kind: "other" });
    lines.sort((a, b) => a.date.localeCompare(b.date));
    const owed = -((await this.cardOwedThrough(cafeId, to)) ?? 0) + 25_200;
    return {
      isStatement: true,
      account,
      bankName: "Garanti BBVA Bonus",
      accountHint: "8812",
      from,
      to,
      opening: null,
      closing: tl(owed),
      lines,
      doubts: ["Demo: ekstre gerçekten okunmadı; satırlar kafenin kendi kayıtlarından yazıldı."],
    };
  }

  /** The demo's Z report for yesterday: the till's own day, with the cash ₺50 short. */
  async demoZ(cafeId: string): Promise<ZReading> {
    const day = await this.demoZDay(cafeId);
    const till = await this.tillDay(cafeId, day);
    const cash = till.cashKurus - 5_000;
    const total = cash + till.cardKurus;
    return {
      isZReport: true,
      date: day,
      zNumber: String(400 + Number(day.slice(8))).padStart(4, "0"),
      total: total / 100,
      cash: cash / 100,
      card: till.cardKurus / 100,
      other: null,
      receipts: till.payments,
      refunds: null,
      kdv: [{ rate: 10, amount: Math.round(total / 11) / 100 }],
      doubts: ["Demo: Z raporu gerçekten okunmadı; rakamlar dünkü kasadan yazıldı."],
    };
  }

  /** Demo only: a file to send in, made from the demo café's numbers. */
  async sample(cafeId: string, kind: "bank" | "card" | "zreport"): Promise<{ bytes: Uint8Array; name: string }> {
    if (kind === "zreport") {
      const z = await this.demoZ(cafeId);
      const n = (v: number | null) => (v ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const row = (label: string, v: number | null) => ({ text: `${label.padEnd(24)}${n(v).padStart(16)}` });
      return {
        name: `z-raporu-${z.date}.pdf`,
        bytes: receiptPdf([
          { text: "MODA KAHVESI", bold: true },
          { text: "Z RAPORU", bold: true },
          { text: `TARIH: ${z.date!.split("-").reverse().join(".")}     Z NO: ${z.zNumber}` },
          { text: "----------------------------------------" },
          row("FIS SAYISI", z.receipts),
          row("TOPKDV", z.kdv[0]?.amount ?? 0),
          { text: "----------------------------------------" },
          row("NAKIT", z.cash),
          row("KREDI KARTI", z.card),
          { ...row("TOPLAM", z.total), bold: true },
        ]),
      };
    }
    const s = await this.demoStatement(cafeId, kind);
    const n = (v: number | null) => (v === null ? "" : v.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }));
    const csv = [
      kind === "bank" ? "Tarih;Açıklama;Tutar;Bakiye" : "İşlem Tarihi;Açıklama;Tutar",
      ...s.lines.map((l) =>
        [l.date.split("-").reverse().join("."), l.description, n(kind === "card" ? -l.amount : l.amount), ...(kind === "bank" ? [n(l.balance)] : [])].join(";"),
      ),
    ].join("\r\n");
    return { name: `${kind === "bank" ? "banka" : "kredi-karti"}-ekstresi-${s.to}.csv`, bytes: new TextEncoder().encode(`﻿${csv}\r\n`) };
  }

  private async demoZDay(cafeId: string): Promise<string> {
    return shift(localDateKey(this.now(), (await this.directory.getSettings(cafeId)).timeZone), -1);
  }

  private require(ctx: StaffContext): void {
    if (ctx.permissions.has("cash.manage")) return;
    throw ctx.rolePermissions.has("cash.manage")
      ? new AppError("NEEDS_PASSWORD", "Sign in with your password for this", 403)
      : new AppError("FORBIDDEN", "Not allowed", 403);
  }
}

export function outcomeDto(o: CheckOutcome | null): CheckOutcomeDTO | null {
  return o ? { ...o } : null;
}

const recordDto = (r: StatementRecord): StatementRecordDTO => ({
  kind: r.kind as StatementRecordDTO["kind"],
  label: r.label,
  day: r.day,
  amountKurus: r.amountKurus,
  billId: r.billId,
});

/** "2026-10-18" moved by n days. */
function shift(day: string, n: number): string {
  return addDays(new Date(`${day}T12:00:00Z`), n)
    .toISOString()
    .slice(0, 10);
}

/** "2026-10-18" → "18.10". */
const trDay = (day: string) => day.slice(5).split("-").reverse().join(".");
