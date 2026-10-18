"use client";

import {
  newIdempotencyKey,
  PeniApiError,
  type BillDTO,
  type CardDTO,
  type CheckDTO,
  type DebtKindDTO,
  type DebtRowDTO,
  type DebtsDTO,
  type LenderDTO,
  type MoneyMethodDTO,
} from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { formatDay, parseTL, tlInput } from "../amounts";
import { Field, Segmented, Stat, useSave } from "../controls";
import { billHref } from "../faturalar/bills";
import { METHOD, PaymentLine, PayForm } from "../pay";
import { field, PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

type Open =
  | { kind: "bill"; id: string }
  | { kind: "check"; id: string }
  | { kind: "lender"; key: string }
  | { kind: "card" }
  | { kind: "addCheck" }
  | { kind: "addLoan" }
  | { kind: "cardSettings" }
  | null;

const KIND: Record<DebtKindDTO, TextKey> = { bill: "kindBill", check: "kindCheck", loan: "kindLoan", card: "kindCard" };
const MONEY: MoneyMethodDTO[] = ["cash", "card", "bank"];

/**
 * Borçlar (plan piece 19): everything the café owes in one list, most urgent first, and
 * below it the checks, the people owed and the credit card. Each opens to pay it down.
 */
export function Debts({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="borclar" wide>
      {(p) => <DebtsPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function DebtsPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<DebtsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const load = () =>
    api.staff.debts.get(cafe.slug).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
  useEffect(() => {
    void load();
    // Once per café.
  }, [cafe.slug]);

  const openRow = (r: DebtRowDTO) =>
    setOpen(
      r.kind === "bill"
        ? { kind: "bill", id: r.id }
        : r.kind === "check"
          ? { kind: "check", id: r.id }
          : r.kind === "loan"
            ? { kind: "lender", key: r.id }
            : { kind: "card" },
    );
  const sheet = { t, lang, slug: cafe.slug, onClose: () => setOpen(null), onSaved: setData };

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("debts")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("debtsHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <dl className="flex flex-wrap gap-x-8 gap-y-4">
              <Stat label={t("statDebtTotal")} value={formatTL(data.totals.totalKurus)} />
              <Stat label={t("statOverdue")} value={formatTL(data.totals.overdueKurus)} tone={data.totals.overdueKurus ? "red" : undefined} />
              <Stat label={t("statDebtWeek")} value={formatTL(data.totals.weekKurus)} />
            </dl>
            {data.canEdit && (
              <div className="flex flex-wrap gap-2">
                <Button kind="quiet" onClick={() => setOpen({ kind: "addCheck" })}>
                  {t("addCheck")}
                </Button>
                <Button kind="quiet" onClick={() => setOpen({ kind: "addLoan" })}>
                  {t("addLoan")}
                </Button>
              </div>
            )}
          </section>

          {data.rows.length === 0 ? (
            <p className="rounded-3xl bg-panel p-6 text-muted">{t("noDebts")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {data.rows.map((r) => (
                <li key={`${r.kind}:${r.id}`}>
                  <DebtRow t={t} lang={lang} row={r} today={data.today} onOpen={() => openRow(r)} />
                </li>
              ))}
            </ul>
          )}

          <Section title={t("checks")} help={t("checksHelp")}>
            {data.checks.length === 0 ? (
              <p className="text-sm text-muted">{t("noChecks")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {data.checks.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: "check", id: c.id })}
                      className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-3 text-left"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className={c.state === "cashed" ? "text-muted" : ""}>{c.payee}</span>
                        <span className="truncate text-sm text-muted">{[c.bankName, `No ${c.number}`].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`text-lg font-semibold tabular ${c.state === "cashed" ? "text-muted" : ""}`}>{formatTL(c.amountKurus)}</span>
                        <CheckPill t={t} lang={lang} check={c} today={data.today} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t("lenders")} help={t("lendersHelp")}>
            {data.lenders.length === 0 ? (
              <p className="text-sm text-muted">{t("noLenders")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                {data.lenders.map((l) => (
                  <li key={l.key}>
                    <button
                      type="button"
                      onClick={() => setOpen({ kind: "lender", key: l.key })}
                      className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-3 text-left"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span>{l.name}</span>
                        <span className="text-sm text-muted">
                          {fill(t("borrowedRepaid"), { borrowed: formatTL(l.borrowedKurus), repaid: formatTL(l.repaidKurus) })}
                        </span>
                      </span>
                      <span className={`shrink-0 text-lg font-semibold tabular ${l.owedKurus ? "" : "text-muted"}`}>
                        {l.owedKurus ? formatTL(l.owedKurus) : t("allPaidBack")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {(data.card || data.cardNotSet) && (
            <Section title={t("card")} help={t("cardHelp")}>
              {data.card ? (
                <CardSummary t={t} lang={lang} card={data.card} onOpen={() => setOpen({ kind: "card" })} />
              ) : (
                <div className="flex flex-col items-start gap-3 rounded-3xl bg-panel p-5">
                  <p className="text-sm leading-normal text-muted">{t("setUpCardHelp")}</p>
                  <Button kind="primary" onClick={() => setOpen({ kind: "cardSettings" })}>
                    {t("setUpCard")}
                  </Button>
                </div>
              )}
            </Section>
          )}

          {open?.kind === "bill" && <BillSheet {...sheet} billId={open.id} today={data.today} onChanged={() => void load()} />}
          {open?.kind === "check" && data.checks.some((c) => c.id === open.id) && (
            <CheckSheet {...sheet} data={data} check={data.checks.find((c) => c.id === open.id)!} />
          )}
          {open?.kind === "lender" && data.lenders.some((l) => l.key === open.key) && (
            <LenderSheet {...sheet} data={data} lender={data.lenders.find((l) => l.key === open.key)!} />
          )}
          {open?.kind === "card" && data.card && <CardSheet {...sheet} data={data} card={data.card} onSettings={() => setOpen({ kind: "cardSettings" })} />}
          {open?.kind === "addCheck" && <AddCheckSheet {...sheet} data={data} />}
          {open?.kind === "addLoan" && <AddLoanSheet {...sheet} data={data} />}
          {open?.kind === "cardSettings" && <CardSettingsSheet {...sheet} card={data.card} />}
        </>
      )}
    </>
  );
}

function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-3xl">{title}</h2>
        <p className="text-sm leading-normal text-muted">{help}</p>
      </div>
      {children}
    </section>
  );
}

function DuePill({ t, lang, dueDate, overdue, today }: { t: T; lang: Lang; dueDate: string | null; overdue: boolean; today: string }) {
  const label = !dueDate
    ? t("noDate")
    : overdue
      ? `${t("stateOverdue")} · ${formatDay(dueDate, lang)}`
      : dueDate === today
        ? t("dueToday")
        : fill(t("dueOn"), { day: formatDay(dueDate, lang) });
  const tone = overdue ? "bg-red-soft text-red" : dueDate ? "bg-tile text-ink" : "text-muted";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

function DebtRow({ t, lang, row, today, onOpen }: { t: T; lang: Lang; row: DebtRowDTO; today: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-left">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-lg">
          {row.name}
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t(KIND[row.kind])}</span>
        </span>
        {row.detail && <span className="truncate text-sm text-muted">{row.detail}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xl font-semibold tabular">{formatTL(row.amountKurus)}</span>
        <DuePill t={t} lang={lang} dueDate={row.dueDate} overdue={row.overdue} today={today} />
      </span>
    </button>
  );
}

function CheckPill({ t, lang, check, today }: { t: T; lang: Lang; check: CheckDTO; today: string }) {
  if (check.state === "cashed")
    return <span className="text-xs font-semibold text-green">{fill(t("checkCashed"), { day: formatDay(check.cashedOn!, lang) })}</span>;
  const late = check.dueDate < today;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${late ? "bg-red-soft text-red" : "bg-tile text-ink"}`}>
      {fill(t(check.state === "due" ? "checkDueNow" : "checkOpen"), { day: formatDay(check.dueDate, lang) })}
    </span>
  );
}

function CardSummary({ t, lang, card, onOpen }: { t: T; lang: Lang; card: CardDTO; onOpen?: () => void }) {
  const used = card.limitKurus ? Math.min(100, (100 * Math.max(card.balanceKurus, 0)) / card.limitKurus) : 0;
  const body = (
    <>
      <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="text-lg">{card.name}</span>
        <span className="text-sm text-muted">{fill(t("cardDays"), { s: card.statementDay, d: card.dueDay })}</span>
      </span>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat label={t("cardBalance")} value={formatTL(card.balanceKurus)} />
        <Stat
          label={t("cardRemaining")}
          value={formatTL(card.remainingKurus)}
          tone={card.remainingKurus < 0 ? "red" : undefined}
          sub={card.remainingKurus < 0 ? t("overLimit") : undefined}
        />
        <Stat
          label={fill(t("cardStatement"), { day: formatDay(card.lastClose, lang) })}
          value={formatTL(card.statementKurus)}
          tone={card.overdueKurus ? "red" : undefined}
          sub={
            card.overdueKurus
              ? fill(t("cardOverdue"), { tl: formatTL(card.overdueKurus) })
              : card.statementKurus
                ? fill(t("cardDueOn"), { day: formatDay(card.dueDate, lang) })
                : undefined
          }
        />
      </dl>
      <span className="flex h-2 w-full overflow-hidden rounded-full bg-paper" aria-hidden="true">
        <span className={card.remainingKurus < 0 ? "bg-red" : "bg-ink"} style={{ width: `${used}%` }} />
      </span>
      <span className="text-sm text-muted">{fill(t("cardNextClose"), { day: formatDay(card.nextClose, lang) })}</span>
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className="flex w-full cursor-pointer flex-col gap-4 rounded-3xl bg-panel p-5 text-left">
      {body}
    </button>
  ) : (
    <div className="flex flex-col gap-4 rounded-3xl bg-panel p-5">{body}</div>
  );
}

type SheetProps = { t: T; lang: Lang; slug: string; onClose: () => void; onSaved: (d: DebtsDTO) => void };

/** A bill to pay, without leaving Borçlar. */
function BillSheet({ t, lang, slug, billId, today, onClose, onChanged }: SheetProps & { billId: string; today: string; onChanged: () => void }) {
  const [bill, setBill] = useState<BillDTO | null>(null);
  const changed = (b: BillDTO) => {
    setBill(b);
    onChanged();
  };
  const save = useSave<BillDTO>(lang, changed);
  useEffect(() => {
    api.staff.bills.get(slug, billId).then(setBill, (e: unknown) => save.setError(errorText(e, lang)));
  }, [slug, billId]);
  return (
    <Sheet title={bill ? (bill.supplierName ?? bill.summary) : t("loading")} onClose={onClose} labelClose={t("close")} wide>
      {bill && (
        <>
          <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>{bill.summary}</span>
            <span>{formatDay(bill.date, lang, { year: true })}</span>
            <a className="underline underline-offset-4" href={billHref(slug, bill.id)}>
              {t("openBill")}
            </a>
          </div>
          <p className="flex items-baseline justify-between border-y border-line-soft py-3">
            <span>
              {t("billTotal")} <span className="text-sm text-muted">· {t("kdvIncluded")}</span>
            </span>
            <span className="text-2xl font-semibold tabular">{formatTL(bill.totalKurus)}</span>
          </p>
          {bill.payments.map((p) => (
            <PaymentLine
              key={p.id}
              t={t}
              lang={lang}
              payment={p}
              busy={save.busy}
              onUndo={p.canRemove ? () => save.run(() => api.staff.bills.removePayment(slug, bill.id, p.id)) : null}
            />
          ))}
          {bill.payWith ? (
            <section className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
              <h3 className="font-semibold">{bill.paidKurus > 0 ? t("addPayment") : t("markPaid")}</h3>
              <PayForm t={t} lang={lang} slug={slug} bill={bill} today={today} onDone={changed} />
            </section>
          ) : (
            bill.state !== "paid" && <Notice>{t("payNeedsManager")}</Notice>
          )}
        </>
      )}
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

function CheckSheet({ t, lang, slug, data, check, onClose, onSaved }: SheetProps & { data: DebtsDTO; check: CheckDTO }) {
  const [cashedOn, setCashedOn] = useState(data.today);
  const save = useSave(lang, onSaved);
  return (
    <Sheet title={check.payee} onClose={onClose} labelClose={t("close")}>
      <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>{[check.bankName, `No ${check.number}`].filter(Boolean).join(" · ")}</span>
        <CheckPill t={t} lang={lang} check={check} today={data.today} />
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-4">
        <Stat label={t("payAmount")} value={formatTL(check.amountKurus)} />
        <Stat label={t("checkWrittenOn")} value={formatDay(check.writtenOn, lang, { year: true })} />
        <Stat label={t("checkDue")} value={formatDay(check.dueDate, lang, { year: true })} />
      </dl>
      {check.note && <p className="leading-normal">{check.note}</p>}
      {check.billId && (
        <p className="text-sm text-muted">
          {t("checkFromBill")}{" "}
          <a className="underline underline-offset-4" href={billHref(slug, check.billId)}>
            {t("openBill")}
          </a>
        </p>
      )}
      {data.canEdit &&
        (check.state === "cashed" ? (
          <div>
            <Button kind="quiet" disabled={save.busy} onClick={() => save.run(() => api.staff.debts.cashCheck(slug, check.id, { cashed: false }))}>
              {t("undoCashed")}
            </Button>
          </div>
        ) : (
          <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("cashedOn")}
              <input
                type="date"
                className={`${field} min-h-12`}
                value={cashedOn}
                min={check.writtenOn}
                max={data.today}
                onChange={(e) => setCashedOn(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                kind="primary"
                disabled={save.busy || !cashedOn}
                onClick={() => save.run(() => api.staff.debts.cashCheck(slug, check.id, { cashed: true, cashedOn }))}
              >
                {t("markCashed")}
              </Button>
              {check.removable && (
                <Button kind="bare" disabled={save.busy} onClick={() => save.run(() => api.staff.debts.removeCheck(slug, check.id))}>
                  {t("removeCheck")}
                </Button>
              )}
            </div>
          </section>
        ))}
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

function LenderSheet({ t, lang, slug, data, lender, onClose, onSaved }: SheetProps & { data: DebtsDTO; lender: LenderDTO }) {
  const key = useRef(newIdempotencyKey());
  const [amount, setAmount] = useState(tlInput(lender.owedKurus));
  const [method, setMethod] = useState<MoneyMethodDTO>("cash");
  const [paidOn, setPaidOn] = useState(data.today);
  const save = useSave<DebtsDTO>(lang, (d) => {
    key.current = newIdempotencyKey();
    setAmount(tlInput(d.lenders.find((l) => l.key === lender.key)?.owedKurus ?? 0));
    onSaved(d);
  });
  const amountKurus = parseTL(amount);
  const ok = amountKurus !== null && amountKurus > 0 && amountKurus <= lender.owedKurus;
  return (
    <Sheet title={lender.name} onClose={onClose} labelClose={t("close")} wide>
      <dl className="-mt-2 flex flex-wrap gap-x-8 gap-y-4">
        <Stat
          label={t("statOwed")}
          value={formatTL(lender.owedKurus)}
          sub={lender.dueDate ? fill(t("dueOn"), { day: formatDay(lender.dueDate, lang) }) : undefined}
        />
        <Stat label={t("lentTotal")} value={formatTL(lender.borrowedKurus)} />
        <Stat label={t("repayments")} value={formatTL(lender.repaidKurus)} />
      </dl>

      {data.canEdit && lender.owedKurus > 0 && (
        <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <h3 className="font-semibold">{t("repay")}</h3>
          <Segmented label={t("repayHow")} value={method} onChange={setMethod} options={MONEY.map((m) => ({ value: m, label: t(METHOD[m]) }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("payAmount")} value={amount} onChange={setAmount} inputMode="decimal" suffix="₺" />
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("paidOn")}
              <input type="date" className={`${field} min-h-12`} value={paidOn} max={data.today} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
          </div>
          <div>
            <Button
              kind="primary"
              disabled={!ok || !paidOn || save.busy}
              onClick={() => save.run(() => api.staff.debts.repay(slug, { key: key.current, lender: lender.key, amountKurus: amountKurus!, method, paidOn }))}
            >
              {t("repay")} · {formatTL(ok ? amountKurus! : 0)}
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-muted">{t("loans")}</h3>
        <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {lender.loans.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4 py-3">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>
                  {l.billId ? (
                    <a className="underline underline-offset-4" href={billHref(slug, l.billId)}>
                      {l.billName ?? t("kindBill")}
                    </a>
                  ) : (
                    (l.note ?? t("kindLoan"))
                  )}
                </span>
                <span className="text-sm text-muted">
                  {formatDay(l.borrowedOn, lang)}
                  {l.dueDate && ` · ${fill(t("dueOn"), { day: formatDay(l.dueDate, lang) })}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="flex flex-col items-end">
                  <span className="font-semibold tabular">{formatTL(l.amountKurus)}</span>
                  <span className={`text-xs ${l.leftKurus ? "text-muted" : "text-green"}`}>
                    {l.leftKurus ? fill(t("loanLeft"), { tl: formatTL(l.leftKurus) }) : t("loanPaidOff")}
                  </span>
                </span>
                {data.canEdit && l.removable && (
                  <Button kind="bare" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.debts.removeLoan(slug, l.id))}>
                    {t("removeLoan")}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {lender.repayments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">{t("repayments")}</h3>
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {lender.repayments.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold tabular">{formatTL(r.amountKurus)}</span>
                  <span className="text-sm text-muted">{[t(METHOD[r.method]), formatDay(r.paidOn, lang), r.by].filter(Boolean).join(" · ")}</span>
                </span>
                {data.canEdit && (
                  <Button kind="bare" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.debts.removeRepayment(slug, r.id))}>
                    {t("undo")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

function CardSheet({ t, lang, slug, data, card, onClose, onSaved, onSettings }: SheetProps & { data: DebtsDTO; card: CardDTO; onSettings: () => void }) {
  const key = useRef(newIdempotencyKey());
  const suggested = (c: CardDTO) => (c.statementKurus > 0 ? c.statementKurus : Math.max(c.balanceKurus, 0));
  const [amount, setAmount] = useState(tlInput(suggested(card)));
  const [method, setMethod] = useState<"cash" | "bank">("bank");
  const [paidOn, setPaidOn] = useState(data.today);
  const save = useSave<DebtsDTO>(lang, (d) => {
    key.current = newIdempotencyKey();
    if (d.card) setAmount(tlInput(suggested(d.card)));
    onSaved(d);
  });
  const amountKurus = parseTL(amount);
  const ok = amountKurus !== null && amountKurus > 0 && amountKurus <= card.balanceKurus;
  return (
    <Sheet title={card.name} onClose={onClose} labelClose={t("close")} wide>
      <CardSummary t={t} lang={lang} card={card} />
      {card.balanceKurus > 0 && (
        <section className="flex flex-col gap-4 rounded-3xl border border-line p-5">
          <h3 className="font-semibold">{t("payTheCard")}</h3>
          <Segmented
            label={t("repayHow")}
            value={method}
            onChange={setMethod}
            options={(["bank", "cash"] as const).map((m) => ({ value: m, label: t(METHOD[m]) }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("payAmount")} value={amount} onChange={setAmount} inputMode="decimal" suffix="₺" />
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("paidOn")}
              <input type="date" className={`${field} min-h-12`} value={paidOn} max={data.today} onChange={(e) => setPaidOn(e.target.value)} />
            </label>
          </div>
          <div>
            <Button
              kind="primary"
              disabled={!ok || !paidOn || save.busy}
              onClick={() => save.run(() => api.staff.debts.payCard(slug, { key: key.current, amountKurus: amountKurus!, method, paidOn }))}
            >
              {fill(t("payButton"), { tl: formatTL(ok ? amountKurus! : 0) })}
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-muted">{t("cardCharges")}</h3>
        {card.charges.length === 0 ? (
          <p className="text-sm text-muted">{t("noCardCharges")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {card.charges.map((c) => (
              <li key={c.paymentId} className="flex items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <a className="underline underline-offset-4" href={billHref(slug, c.billId)}>
                    {c.name}
                  </a>
                  <span className="text-sm text-muted">{formatDay(c.paidOn, lang)}</span>
                </span>
                <span className="font-semibold tabular">{formatTL(c.amountKurus)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {card.payments.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-muted">{t("cardPayments")}</h3>
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {card.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold tabular">{formatTL(p.amountKurus)}</span>
                  <span className="text-sm text-muted">{[t(METHOD[p.method]), formatDay(p.paidOn, lang), p.by].filter(Boolean).join(" · ")}</span>
                </span>
                <Button kind="bare" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.debts.removeCardPayment(slug, p.id))}>
                  {t("undo")}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div>
        <Button kind="quiet" onClick={onSettings}>
          {t("cardSettings")}
        </Button>
      </div>
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

function AddCheckSheet({ t, lang, slug, data, onClose, onSaved }: SheetProps & { data: DebtsDTO }) {
  const key = useRef(newIdempotencyKey());
  const [supplierId, setSupplierId] = useState("");
  const [payee, setPayee] = useState("");
  const [number, setNumber] = useState("");
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [writtenOn, setWrittenOn] = useState(data.today);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const save = useSave<DebtsDTO>(lang, (d) => {
    onSaved(d);
    onClose();
  });
  const amountKurus = parseTL(amount);
  const ready =
    (supplierId ? supplierId !== "__other" || payee.trim() : false) &&
    number.trim() &&
    amountKurus &&
    amountKurus > 0 &&
    writtenOn &&
    dueDate &&
    dueDate >= writtenOn;
  return (
    <Sheet title={t("addCheck")} onClose={onClose} labelClose={t("close")}>
      <p className="-mt-2 text-sm leading-normal text-muted">{t("addCheckHelp")}</p>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("checkPayee")}
        <select className={`${field} min-h-12`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">{t("lenderPick")}</option>
          {data.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="__other">{t("lenderOther")}</option>
        </select>
      </label>
      {supplierId === "__other" && <Field label={t("checkPayeeOther")} value={payee} onChange={setPayee} maxLength={80} autoFocus />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("checkNumber")} value={number} onChange={setNumber} maxLength={30} />
        <Field label={t("checkBank")} value={bank} onChange={setBank} maxLength={60} />
        <Field label={t("payAmount")} value={amount} onChange={setAmount} inputMode="decimal" suffix="₺" />
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("checkWrittenOn")}
          <input type="date" className={`${field} min-h-12`} value={writtenOn} max={data.today} onChange={(e) => setWrittenOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("checkDue")}
          <input type="date" className={`${field} min-h-12`} value={dueDate} min={writtenOn} onChange={(e) => setDueDate(e.target.value)} />
        </label>
      </div>
      <Field label={t("noteOptional")} value={note} onChange={setNote} maxLength={300} />
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button
          kind="primary"
          disabled={!ready || save.busy}
          onClick={() =>
            save.run(() =>
              api.staff.debts.addCheck(slug, {
                key: key.current,
                number: number.trim(),
                bankName: bank.trim() || null,
                ...(supplierId === "__other" ? { payee: payee.trim() } : { supplierId }),
                amountKurus: amountKurus!,
                writtenOn,
                dueDate,
                note: note.trim() || null,
              }),
            )
          }
        >
          {t("addCheck")}
        </Button>
      </div>
    </Sheet>
  );
}

function AddLoanSheet({ t, lang, slug, data, onClose, onSaved }: SheetProps & { data: DebtsDTO }) {
  const key = useRef(newIdempotencyKey());
  const [lender, setLender] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [borrowedOn, setBorrowedOn] = useState(data.today);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const save = useSave<DebtsDTO>(lang, (d) => {
    onSaved(d);
    onClose();
  });
  // People owed before who aren't on the team, by the name first typed for them.
  const others = data.lenders.filter((l) => !l.memberId);
  const amountKurus = parseTL(amount);
  const named = lender === "__other" ? name.trim() : (others.find((l) => l.key === lender)?.name ?? "");
  const ready = (lender.startsWith("member:") || named) && amountKurus && amountKurus > 0 && borrowedOn && (!dueDate || dueDate >= borrowedOn);
  return (
    <Sheet title={t("addLoan")} onClose={onClose} labelClose={t("close")}>
      <p className="-mt-2 text-sm leading-normal text-muted">{t("addLoanHelp")}</p>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("lenderWho")}
        <select className={`${field} min-h-12`} value={lender} onChange={(e) => setLender(e.target.value)}>
          <option value="">{t("lenderPick")}</option>
          {data.team.map((m) => (
            <option key={m.memberId} value={`member:${m.memberId}`}>
              {m.name}
            </option>
          ))}
          {others.map((l) => (
            <option key={l.key} value={l.key}>
              {l.name}
            </option>
          ))}
          <option value="__other">{t("lenderOther")}</option>
        </select>
      </label>
      {lender === "__other" && <Field label={t("lenderName")} value={name} onChange={setName} maxLength={80} autoFocus />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("payAmount")} value={amount} onChange={setAmount} inputMode="decimal" suffix="₺" />
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("borrowedOn")}
          <input type="date" className={`${field} min-h-12`} value={borrowedOn} max={data.today} onChange={(e) => setBorrowedOn(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm text-muted">
        {t("loanDue")}
        <input type="date" className={`${field} min-h-12`} value={dueDate} min={borrowedOn} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      <Field label={t("loanWhat")} value={note} onChange={setNote} placeholder={t("loanWhatPlaceholder")} maxLength={300} />
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button
          kind="primary"
          disabled={!ready || save.busy}
          onClick={() =>
            save.run(() =>
              api.staff.debts.addLoan(slug, {
                key: key.current,
                lender: lender.startsWith("member:") ? { memberId: lender.slice(7) } : { name: named },
                amountKurus: amountKurus!,
                borrowedOn,
                dueDate: dueDate || null,
                note: note.trim() || null,
              }),
            )
          }
        >
          {t("addLoan")}
        </Button>
      </div>
    </Sheet>
  );
}

function CardSettingsSheet({ t, lang, slug, card, onClose, onSaved }: SheetProps & { card: CardDTO | null }) {
  const [name, setName] = useState(card?.name ?? "");
  const [limit, setLimit] = useState(card ? tlInput(card.limitKurus) : "");
  const [statementDay, setStatementDay] = useState(card ? String(card.statementDay) : "");
  const [dueDay, setDueDay] = useState(card ? String(card.dueDay) : "");
  const save = useSave<DebtsDTO>(lang, (d) => {
    onSaved(d);
    onClose();
  });
  const limitKurus = parseTL(limit);
  const day = (v: string) => (/^\d{1,2}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 28 ? Number(v) : null);
  const ready = name.trim() && limitKurus !== null && limitKurus >= 0 && day(statementDay) && day(dueDay);
  return (
    <Sheet title={card ? t("cardSettings") : t("setUpCard")} onClose={onClose} labelClose={t("close")}>
      <Field label={t("cardName")} value={name} onChange={setName} placeholder={t("cardNamePlaceholder")} maxLength={80} />
      <Field label={t("cardLimit")} value={limit} onChange={setLimit} inputMode="decimal" suffix="₺" />
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("statementDay")} value={statementDay} onChange={setStatementDay} inputMode="decimal" hint={t("dayOfMonthHint")} />
        <Field label={t("dueDay")} value={dueDay} onChange={setDueDay} inputMode="decimal" />
      </div>
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button
          kind="primary"
          disabled={!ready || save.busy}
          onClick={() =>
            save.run(() =>
              api.staff.debts.setCard(slug, { name: name.trim(), limitKurus: limitKurus!, statementDay: day(statementDay)!, dueDay: day(dueDay)! }),
            )
          }
        >
          {t("save")}
        </Button>
      </div>
    </Sheet>
  );
}
