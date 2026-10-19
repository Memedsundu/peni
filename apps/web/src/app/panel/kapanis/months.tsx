"use client";

import { PeniApiError, type BillPayMethodDTO, type MonthCloseDTO, type MonthsDTO, type MonthSummaryDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { formatDay, formatMonth } from "../amounts";
import { Field, useSave } from "../controls";
import { METHOD } from "../pay";
import { PanelShell, when, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

/**
 * Ay kapanışı (plan piece 20): the month that can be closed now with its numbers, and
 * the months closed before, each with the numbers it was closed with.
 */
export function Months({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="kapanis" wide>
      {(p) => <MonthsPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function MonthsPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<MonthsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const save = useSave<MonthsDTO>(lang, (d) => {
    setData(d);
    setNote("");
  });

  useEffect(() => {
    api.staff.money.months(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
    // Once per café.
  }, [cafe.slug]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("months")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("monthsHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          {data.next ? (
            <section className="flex flex-col gap-5 rounded-3xl border border-line p-5">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted">{t("monthToClose")}</p>
                <h2 className="font-serif text-3xl capitalize">{formatMonth(data.next.month, lang)}</h2>
                <p className="text-xs text-muted">{t("monthSoFar")}</p>
              </div>
              <Summary t={t} lang={lang} summary={data.next.summary} />
              {data.canClose ? (
                <div className="flex flex-col gap-4">
                  <Field label={t("moneyNoteOptional")} value={note} onChange={setNote} placeholder={t("closeNotePlaceholder")} maxLength={200} />
                  {save.error && <Notice tone="red">{save.error}</Notice>}
                  <div>
                    <Button
                      kind="primary"
                      disabled={save.busy}
                      onClick={() =>
                        save.run(() => api.staff.money.closeMonth(cafe.slug, { month: data.next!.month, ...(note.trim() ? { note: note.trim() } : {}) }))
                      }
                    >
                      {fill(t("closeMonth"), { month: formatMonth(data.next.month, lang) })}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">{t("closeOwnerOnly")}</p>
              )}
            </section>
          ) : (
            <p className="rounded-3xl bg-panel p-6 text-muted">{fill(t("nothingToClose"), { month: formatMonth(data.today.slice(0, 7), lang) })}</p>
          )}

          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-3xl">{t("closedMonths")}</h2>
            {data.closes.length === 0 ? (
              <p className="text-sm text-muted">{t("noCloses")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.closes.map((c) => (
                  <li key={c.id}>
                    <Closed t={t} lang={lang} slug={cafe.slug} close={c} onDone={setData} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function Closed({ t, lang, slug, close: c, onDone }: { t: T; lang: Lang; slug: string; close: MonthCloseDTO; onDone: (d: MonthsDTO) => void }) {
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const save = useSave<MonthsDTO>(lang, (d) => {
    setReopening(false);
    onDone(d);
  });
  return (
    <details className={`group rounded-3xl p-5 ${c.reopenedAt ? "border border-line-soft" : "bg-panel"}`} open={c.canReopen}>
      <summary className="flex cursor-pointer list-none flex-col gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className={`font-serif text-2xl capitalize ${c.reopenedAt ? "text-muted" : ""}`}>{formatMonth(c.month, lang)}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.reopenedAt ? "bg-tile text-ink" : "bg-green-soft text-green"}`}>
            {t(c.reopenedAt ? "reopened" : "standing")}
          </span>
        </span>
        <span className="text-sm text-muted">
          {fill(t("closedBy"), { by: c.by ?? "", when: when(c.closedAt, lang) })}
          {c.note && ` · ${c.note}`}
        </span>
        {c.reopenedAt && <span className="text-sm text-muted">{fill(t("reopenedBy"), { by: c.reopenedBy ?? "", reason: c.reopenReason ?? "" })}</span>}
      </summary>
      <div className="mt-5 flex flex-col gap-5">
        <Summary t={t} lang={lang} summary={c.summary} />
        {c.canReopen &&
          (reopening ? (
            <div className="flex flex-col gap-4 rounded-3xl border border-line bg-paper p-5">
              <p className="text-sm leading-normal text-muted">{t("reopenHelp")}</p>
              <Field label={t("reopenWhy")} value={reason} onChange={setReason} placeholder={t("reopenPlaceholder")} maxLength={200} autoFocus />
              {save.error && <Notice tone="red">{save.error}</Notice>}
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="danger"
                  disabled={!reason.trim() || save.busy}
                  onClick={() => save.run(() => api.staff.money.reopenMonth(slug, c.id, { reason: reason.trim() }))}
                >
                  {t("reopen")}
                </Button>
                <Button kind="bare" onClick={() => setReopening(false)}>
                  {t("close")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button kind="quiet" onClick={() => setReopening(true)}>
                {t("reopen")}
              </Button>
            </div>
          ))}
      </div>
    </details>
  );
}

/** A month's numbers in five blocks: sales, bills, wages, money at the end, owed at the end. */
function Summary({ t, lang, summary: s }: { t: T; lang: Lang; summary: MonthSummaryDTO }) {
  const money = (v: number | null) => (v === null ? t("sumNotKept") : formatTL(v));
  const paid = Object.entries(s.bills.paidKurus).filter(([, v]) => v > 0);
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <Block title={t("sumSales")} total={formatTL(s.sales.totalKurus)}>
        <Row label={t("payCash")} value={formatTL(s.sales.cashKurus)} />
        <Row label={t("payCard")} value={formatTL(s.sales.cardKurus)} />
      </Block>
      <Block title={t("sumBills")} total={formatTL(s.bills.totalKurus)} sub={fill(t("sumBillsCount"), { n: s.bills.count })}>
        {paid.length > 0 && <p className="pt-1 text-xs text-muted">{t("sumPaid")}</p>}
        {paid.map(([method, v]) => (
          <Row key={method} label={t(METHOD[method as BillPayMethodDTO])} value={formatTL(v)} />
        ))}
      </Block>
      <Block title={t("sumWages")} total={formatTL(s.wages.earnedKurus)}>
        <Row label={t("statPaid")} value={formatTL(s.wages.paidKurus)} />
      </Block>
      <Block title={t("sumMoney")} sub={formatDay(s.to, lang, { year: true })}>
        <Row label={t("accDrawer")} value={money(s.money.drawerKurus)} />
        <Row label={t("accReserve")} value={money(s.money.reserveKurus)} />
        <Row label={t("accBank")} value={money(s.money.bankKurus)} />
      </Block>
      <Block title={t("sumOwed")} total={formatTL(s.owed.totalKurus)}>
        <Row label={t("kindBill")} value={formatTL(s.owed.billsKurus)} />
        <Row label={t("checks")} value={formatTL(s.owed.checksKurus)} />
        <Row label={t("kindLoan")} value={formatTL(s.owed.loansKurus)} />
        <Row label={t("kindCard")} value={formatTL(s.owed.cardKurus)} />
        <Row label={t("kindWages")} value={formatTL(s.owed.wagesKurus)} />
      </Block>
    </div>
  );
}

function Block({ title, total, sub, children }: { title: string; total?: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted">{title}</p>
      {total && <p className="text-2xl font-semibold tabular">{total}</p>}
      {sub && <p className="text-xs text-muted">{sub}</p>}
      <dl className="mt-1 flex flex-col divide-y divide-line-soft">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
