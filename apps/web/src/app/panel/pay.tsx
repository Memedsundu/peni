"use client";

import { newIdempotencyKey, type BillDTO, type BillPaymentDTO, type BillPayMethodDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useRef, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { formatDay, parseTL, tlInput } from "./amounts";
import { Field, Segmented, useSave } from "./controls";
import { field } from "./shell";
import { fill, type Lang, type T, type TextKey } from "./text";

export const METHOD: Record<BillPayMethodDTO, TextKey> = {
  cash: "payCash",
  card: "payCard",
  bank: "payBank",
  credit: "payCredit",
  check: "payCheck",
  loan: "payLoan",
};

/**
 * "Öde" on a bill (plan piece 19), on Faturalar and on Borçlar: all of what is left or
 * part of it, by cash, card or transfer, or onto the credit card, a check, or someone's
 * pocket. The last three move what is owed to Borçlar.
 */
export function PayForm({
  t,
  lang,
  slug,
  bill,
  today,
  onDone,
}: {
  t: T;
  lang: Lang;
  slug: string;
  bill: BillDTO;
  today: string;
  onDone: (b: BillDTO) => void;
}) {
  const options = bill.payWith!;
  const key = useRef(newIdempotencyKey());
  const [method, setMethod] = useState<BillPayMethodDTO>("cash");
  const [amount, setAmount] = useState(tlInput(options.leftKurus));
  const [paidOn, setPaidOn] = useState(today);
  const [checkNumber, setCheckNumber] = useState("");
  const [checkBank, setCheckBank] = useState("");
  const [checkDue, setCheckDue] = useState("");
  const [lender, setLender] = useState("");
  const [lenderName, setLenderName] = useState("");
  const [loanDue, setLoanDue] = useState("");
  const save = useSave<BillDTO>(lang, (b) => {
    key.current = newIdempotencyKey();
    if (b.payWith) setAmount(tlInput(b.payWith.leftKurus));
    onDone(b);
  });

  const methods: BillPayMethodDTO[] = ["cash", "card", "bank"];
  if (options.credit) methods.push("credit");
  if (options.check) methods.push("check");
  if (options.loan) methods.push("loan");
  const amountKurus = parseTL(amount);
  const amountOk = amountKurus !== null && amountKurus > 0 && amountKurus <= options.leftKurus;
  const named = lender === "__other" ? lenderName.trim() : lender.startsWith("name:") ? lender.slice(5) : "";
  const ready =
    amountOk &&
    !!paidOn &&
    (method !== "check" || (checkNumber.trim() && checkDue && checkDue >= paidOn)) &&
    (method !== "loan" || ((lender.startsWith("member:") || named) && (!loanDue || loanDue >= paidOn)));

  const submit = () =>
    save.run(() =>
      api.staff.bills.pay(slug, bill.id, {
        key: key.current,
        method,
        amountKurus: amountKurus!,
        paidOn,
        ...(method === "check" ? { check: { number: checkNumber.trim(), bankName: checkBank.trim() || null, dueDate: checkDue } } : {}),
        ...(method === "loan" ? { lender: lender.startsWith("member:") ? { memberId: lender.slice(7) } : { name: named }, loanDueDate: loanDue || null } : {}),
      }),
    );

  const help =
    method === "credit"
      ? fill(t("payCreditHelp"), { card: options.credit ?? "" })
      : method === "check"
        ? t("payCheckHelp")
        : method === "loan"
          ? t("payLoanHelp")
          : null;
  return (
    <div className="flex flex-col gap-4">
      <Segmented label={t("payWhat")} value={method} onChange={setMethod} options={methods.map((m) => ({ value: m, label: t(METHOD[m]) }))} />
      {help && <p className="-mt-1 text-sm leading-normal text-muted">{help}</p>}
      {options.creditNotSet && method === "cash" && <p className="-mt-1 text-xs text-muted">{t("creditNotSet")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("payAmount")}
          value={amount}
          onChange={setAmount}
          inputMode="decimal"
          suffix="₺"
          hint={fill(t("payAmountHint"), { tl: formatTL(options.leftKurus) })}
        />
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("paidOn")}
          <input type="date" className={`${field} min-h-12`} value={paidOn} min={bill.date} max={today} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
      </div>
      {method === "check" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("checkNumber")} value={checkNumber} onChange={setCheckNumber} maxLength={30} />
          <Field label={t("checkBank")} value={checkBank} onChange={setCheckBank} maxLength={60} />
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("checkDue")}
            <input type="date" className={`${field} min-h-12`} value={checkDue} min={paidOn} onChange={(e) => setCheckDue(e.target.value)} />
          </label>
        </div>
      )}
      {method === "loan" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("lenderWho")}
            <select className={`${field} min-h-12`} value={lender} onChange={(e) => setLender(e.target.value)}>
              <option value="">{t("lenderPick")}</option>
              {options.team.map((m) => (
                <option key={m.memberId} value={`member:${m.memberId}`}>
                  {m.name}
                </option>
              ))}
              {options.lenderNames.map((n) => (
                <option key={n} value={`name:${n}`}>
                  {n}
                </option>
              ))}
              <option value="__other">{t("lenderOther")}</option>
            </select>
          </label>
          {lender === "__other" ? (
            <Field label={t("lenderName")} value={lenderName} onChange={setLenderName} maxLength={80} autoFocus />
          ) : (
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("loanDue")}
              <input type="date" className={`${field} min-h-12`} value={loanDue} min={paidOn} onChange={(e) => setLoanDue(e.target.value)} />
            </label>
          )}
        </div>
      )}
      {save.error && <Notice tone="red">{save.error}</Notice>}
      <div>
        <Button kind="primary" disabled={!ready || save.busy} onClick={submit}>
          {fill(t("payButton"), { tl: formatTL(amountOk ? amountKurus! : 0) })}
        </Button>
      </div>
    </div>
  );
}

/** One payment on a bill: how and when, what it made (a check, a debt), and "Geri al". */
export function PaymentLine({ t, lang, payment: p, busy, onUndo }: { t: T; lang: Lang; payment: BillPaymentDTO; busy: boolean; onUndo: (() => void) | null }) {
  const detail = p.check
    ? fill(t(p.check.cashedOn ? "paymentCheckCashed" : "paymentCheck"), { number: p.check.number, day: formatDay(p.check.cashedOn ?? p.check.dueDate, lang) })
    : p.lender
      ? fill(t("paymentLender"), { name: p.lender })
      : null;
  const methodName = lang === "en" ? t(METHOD[p.method]).toLowerCase() : t(METHOD[p.method]);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-green-soft px-4 py-3 text-sm text-green sm:flex-row sm:items-center sm:justify-between">
      <span className="flex flex-col gap-0.5">
        <span>
          <span className="font-semibold tabular">{formatTL(p.amountKurus)}</span> ·{" "}
          {fill(t(p.method === "loan" ? "paidByLoan" : "paidBy"), { method: methodName, day: formatDay(p.paidOn, lang), by: p.by ? ` · ${p.by}` : "" })}
        </span>
        {detail && <span className="text-ink">{detail}</span>}
        {p.locked && onUndo && <span className="text-muted">{t(p.locked === "CHECK_CASHED" ? "lockedCheck" : "lockedLoan")}</span>}
      </span>
      {onUndo && !p.locked && (
        <Button kind="bare" size="sm" className="shrink-0 self-start sm:self-center" disabled={busy} onClick={onUndo}>
          {t("undo")}
        </Button>
      )}
    </div>
  );
}
