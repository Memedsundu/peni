"use client";

import type {
  CheckOutcomeDTO,
  DraftDTO,
  StatementCheckDTO,
  StatementDraftDTO,
  StatementLineDTO,
  StatementRecordDTO,
  StatementRecordKindDTO,
  ZCheckDTO,
  ZReportDraftDTO,
} from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { formatDay } from "../amounts";
import { withCafe } from "../bugun/today";
import { Field, Segmented } from "../controls";
import { billHref } from "../faturalar/bills";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

const RECORD: Record<StatementRecordKindDTO, TextKey> = {
  opening: "lineOpening",
  transfer: "transfer",
  deposit: "lineDeposit",
  withdraw: "lineWithdraw",
  correction: "lineCorrection",
  bill: "lineBill",
  check: "lineCheck",
  repayment: "lineRepayment",
  card: "lineCard",
  wages: "lineWages",
  sales: "lineSalesCard",
  drawer: "lineDrawerIn",
  difference: "lineDifference",
  charge: "rec_charge",
  cardPayment: "rec_cardPayment",
};

/** "12/14 satır eşleşti · banka bakiyesi −₺47,50 düzeltildi · “not”", for the banner and Geçmiş. */
export function outcomeText(t: T, kind: DraftDTO["kind"], o: CheckOutcomeDTO | null): string {
  if (!o) return "";
  const parts =
    kind === "statement"
      ? [fill(t("ckMatched"), { n: o.matched, total: o.matched + o.unmatched })]
      : [o.unmatched ? fill(t("ckZDiffers"), { n: o.unmatched }) : t("ckZAgrees")];
  if (o.correctionKurus) parts.push(fill(t("ckCorrected"), { amount: formatTL(o.correctionKurus) }));
  else if (kind === "statement" && o.differenceKurus) parts.push(fill(t("ckDiffOf"), { amount: formatTL(o.differenceKurus) }));
  if (o.note) parts.push(`“${o.note}”`);
  return parts.join(" · ");
}

/** A record's name: what it is, and its supplier or note. */
function recordText(t: T, r: StatementRecordDTO): string {
  return [t(RECORD[r.kind]), r.label].filter(Boolean).join(" · ");
}

/**
 * A bank or credit card statement beside Peni (plan piece 27, A5): the balances, each line
 * with what Peni has for it, and what Peni has that the statement doesn't. "Kontrol edildi"
 * changes nothing unless asked to set the bank balance to the statement's.
 */
export function StatementCheck({
  t,
  lang,
  slug,
  draft,
  canCheck,
  onRefresh,
  onDecided,
}: {
  t: T;
  lang: Lang;
  slug: string;
  draft: StatementDraftDTO;
  canCheck: boolean;
  onRefresh: () => void;
  onDecided: (d: DraftDTO) => void;
}) {
  const s = draft.statement;
  const [show, setShow] = useState<"all" | "open">("all");
  if (!s) return null;
  const matched = s.lines.filter((l) => l.match).length;
  const lines = show === "all" ? s.lines : s.lines.filter((l) => !l.match);
  const card = s.account === "card";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{[t(card ? "ckCard" : "ckBank"), s.bankName, s.accountHint && `…${s.accountHint}`].filter(Boolean).join(" · ")}</p>
        {s.from && s.to && (
          <h2 className="font-serif text-3xl">{fill(t("ckPeriod"), { from: formatDay(s.from, lang), to: formatDay(s.to, lang, { year: true }) })}</h2>
        )}
        <p className="text-sm leading-normal text-muted">{t("ckStatementHelp")}</p>
      </section>

      {s.followed ? (
        <dl className="flex flex-col divide-y divide-line-soft rounded-3xl bg-panel px-5 py-2">
          <Balance label={t("ckClosing")} value={s.closingKurus === null ? null : card ? -Math.abs(s.closingKurus) : s.closingKurus} />
          <Balance
            label={t(card ? "ckPeniOwed" : "ckPeni")}
            value={s.peniBalanceKurus}
            sub={s.inTransitKurus ? fill(t("ckInTransit"), { amount: formatTL(s.inTransitKurus) }) : undefined}
          />
          <Balance
            label={t("ckDifference")}
            value={s.differenceKurus}
            red={!!s.differenceKurus}
            sub={s.feesKurus ? fill(t("ckFees"), { amount: formatTL(s.feesKurus) }) : undefined}
          />
        </dl>
      ) : (
        <Notice>{t("ckNotFollowed")}</Notice>
      )}

      <section className="flex flex-col gap-3" aria-label={t("ckLines")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`font-semibold ${matched < s.lines.length ? "" : "text-green"}`}>{fill(t("ckMatched"), { n: matched, total: s.lines.length })}</p>
          {matched < s.lines.length && (
            <Segmented
              label={t("drShow")}
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: t("ckShowAll") },
                { value: "open", label: `${t("ckShowOpen")} (${s.lines.length - matched})` },
              ]}
            />
          )}
        </div>
        <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {lines.map((l, i) => (
            <LineRow key={i} t={t} lang={lang} slug={slug} line={l} />
          ))}
        </ul>
        {matched < s.lines.length ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-normal text-muted">
            {t("ckUnmatchedHelp")}
            <a className="font-semibold text-ink underline underline-offset-4" href={withCafe("/panel/faturalar", slug)}>
              {t("ckOpenBills")}
            </a>
            <a className="font-semibold text-ink underline underline-offset-4" href={withCafe(card ? "/panel/borclar" : "/panel/nakit", slug)}>
              {t(card ? "ckOpenDebts" : "ckOpenMoney")}
            </a>
            <Button kind="quiet" size="sm" onClick={onRefresh}>
              {t("ckLookAgain")}
            </Button>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("ckAllMatched")}</p>
        )}
      </section>

      {s.missing.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold">{t("ckMissing")}</h3>
            <p className="text-sm leading-normal text-muted">{t("ckMissingHelp")}</p>
          </div>
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {s.missing.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">
                    {r.billId ? (
                      <a className="underline underline-offset-4" href={billHref(slug, r.billId)}>
                        {recordText(t, r)}
                      </a>
                    ) : (
                      recordText(t, r)
                    )}
                  </span>
                  <span className="text-sm text-muted">{formatDay(r.day, lang)}</span>
                </span>
                <span className="font-semibold tabular">{formatTL(r.amountKurus)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CheckForm t={t} lang={lang} slug={slug} draft={draft} canCheck={canCheck} statement={s} onDecided={onDecided} />
    </div>
  );
}

/** One balance as a row: its label (and a note under it) on the left, the amount on the right. */
function Balance({ label, value, sub, red = false }: { label: string; value: number | null; sub?: string; red?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="flex flex-col gap-0.5">
        <span className="text-sm text-muted">{label}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </dt>
      <dd className={`text-2xl font-semibold tabular ${red ? "text-red" : ""}`}>{value === null ? "—" : formatTL(value)}</dd>
    </div>
  );
}

/** One statement line: its day, what it says, its amount, and Peni's record for it or "Peni'de karşılığı yok". */
function LineRow({ t, lang, slug, line: l }: { t: T; lang: Lang; slug: string; line: StatementLineDTO }) {
  const m = l.match;
  return (
    <li className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-baseline">
      <span className="text-sm text-muted tabular">{formatDay(l.date, lang)}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{l.description}</span>
        {m ? (
          <span className="flex items-baseline gap-1.5 text-sm text-green">
            <span aria-hidden>✓</span>
            <span>
              {m.billId ? (
                <a className="underline underline-offset-4" href={billHref(slug, m.billId)}>
                  {recordText(t, m)}
                </a>
              ) : (
                recordText(t, m)
              )}
              {" · "}
              {m.days > 1 ? fill(t("ckDays"), { n: m.days }) : formatDay(m.day, lang)}
              {m.feeKurus > 0 && ` · ${fill(t("ckFee"), { amount: formatTL(m.feeKurus) })}`}
            </span>
          </span>
        ) : (
          <span className="text-sm text-red">
            {t("ckNoLine")} · {t(`guess_${l.guess}` as TextKey)}
          </span>
        )}
      </span>
      <span className={`font-semibold tabular sm:text-right ${l.amountKurus > 0 ? "text-green" : ""}`}>{formatTL(l.amountKurus)}</span>
    </li>
  );
}

/**
 * A Z report beside the till's own day (plan piece 27, A6): cash, card and their total, the
 * till's peni and askı apart, and a note when they don't agree.
 */
export function ZCheck({
  t,
  lang,
  slug,
  draft,
  canCheck,
  onDecided,
}: {
  t: T;
  lang: Lang;
  slug: string;
  draft: ZReportDraftDTO;
  canCheck: boolean;
  onDecided: (d: DraftDTO) => void;
}) {
  const z = draft.zreport;
  if (!z) return null;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          {[t("ckKindZ"), z.zNumber && fill(t("zTitleNo"), { n: z.zNumber }), z.receipts !== null && fill(t("zReceipts"), { n: z.receipts })]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {z.date && <h2 className="font-serif text-3xl">{formatDay(z.date, lang, { year: true })}</h2>}
        <p className="text-sm leading-normal text-muted">{t("zHelp")}</p>
      </section>
      {!z.date && <Notice tone="red">{t("zNoDate")}</Notice>}
      <ZTable t={t} z={z} />
      <div className="flex flex-col gap-1 text-sm leading-normal text-muted">
        {(z.till.peniKurus > 0 || z.till.askiKurus > 0) && (
          <p>{fill(t("zTillOther"), { peni: formatTL(z.till.peniKurus), aski: formatTL(z.till.askiKurus) })}</p>
        )}
        {!!z.otherKurus && <p>{fill(t("zOther"), { amount: formatTL(z.otherKurus) })}</p>}
        {!!z.refundsKurus && <p>{fill(t("zRefunds"), { amount: formatTL(z.refundsKurus) })}</p>}
        {z.kdv.length > 0 && <p>{z.kdv.map((k) => `${fill(t("kdvLine"), { rate: k.ratePct })} ${formatTL(k.amountKurus)}`).join(" · ")}</p>}
      </div>
      <CheckForm t={t} lang={lang} slug={slug} draft={draft} canCheck={canCheck} zreport={z} onDecided={onDecided} />
    </div>
  );
}

function ZTable({ t, z }: { t: T; z: ZCheckDTO }) {
  const tl = (v: number | null) => (v === null ? "—" : formatTL(v));
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[26rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-sm text-muted">
            <th className="py-2 pr-3 font-normal">{t("zWhat")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("zOnZ")}</th>
            <th className="py-2 pr-3 text-right font-normal">{t("zTill")}</th>
            <th className="py-2 text-right font-normal">{t("ckDifference")}</th>
          </tr>
        </thead>
        <tbody>
          {z.rows.map((r) => {
            const off = r.differenceKurus !== null && Math.abs(r.differenceKurus) > 100;
            return (
              <tr key={r.key} className={`border-b border-line-soft ${r.key === "total" ? "font-semibold" : ""}`}>
                <td className="py-3 pr-3">{t(`z_${r.key}`)}</td>
                <td className="py-3 pr-3 text-right tabular">{tl(r.zKurus)}</td>
                <td className="py-3 pr-3 text-right tabular">{formatTL(r.tillKurus)}</td>
                <td className={`py-3 text-right font-semibold tabular ${off ? "text-red" : "text-muted"}`}>{tl(r.differenceKurus)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Kontrol edildi", with a note (needed when a Z report differs) and, for the bank, setting Peni's balance. */
function CheckForm({
  t,
  lang,
  slug,
  draft,
  canCheck,
  statement,
  zreport,
  onDecided,
}: {
  t: T;
  lang: Lang;
  slug: string;
  draft: DraftDTO;
  canCheck: boolean;
  statement?: StatementCheckDTO;
  zreport?: ZCheckDTO;
  onDecided: (d: DraftDTO) => void;
}) {
  const [note, setNote] = useState("");
  const [fix, setFix] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canCheck) return <Notice>{t("ckCantCheck")}</Notice>;

  const needsNote = !!zreport?.differs;
  const canFix = !!statement?.canFix && statement.differenceKurus !== null;
  const submit = () => {
    setBusy(true);
    setError(null);
    api.staff.drafts.check(slug, draft.id, { note: note.trim() || null, fixBalance: canFix && fix }).then(onDecided, (e: unknown) => {
      setError(errorText(e, lang));
      setBusy(false);
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line p-5">
      <Field label={t(needsNote ? "ckNoteZ" : "ckNote")} value={note} onChange={setNote} maxLength={300} />
      {canFix && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 accent-ink" checked={fix} onChange={(e) => setFix(e.target.checked)} />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{fill(t("ckFix"), { amount: formatTL(statement!.differenceKurus!) })}</span>
            <span className="leading-normal text-muted">{t("ckFixHelp")}</span>
          </span>
        </label>
      )}
      <div>
        <Button kind="primary" disabled={busy || (needsNote && !note.trim())} onClick={submit}>
          {t("ckDone")}
        </Button>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
    </section>
  );
}

/** Demo only: a bank statement, card statement or Z report made from the demo café's numbers. */
export function Samples({ t, lang, slug, onSent }: { t: T; lang: Lang; slug: string; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = (kind: "bank" | "card" | "zreport") => {
    setBusy(true);
    setError(null);
    api.staff.drafts.sample(slug, { kind }).then(
      () => {
        setBusy(false);
        onSent();
      },
      (e: unknown) => {
        setError(errorText(e, lang));
        setBusy(false);
      },
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {t("ckSamples")}
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => send("bank")}>
          {t("ckSampleBank")}
        </Button>
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => send("card")}>
          {t("ckSampleCard")}
        </Button>
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => send("zreport")}>
          {t("ckSampleZ")}
        </Button>
      </p>
      {error && <Notice tone="red">{error}</Notice>}
    </div>
  );
}
