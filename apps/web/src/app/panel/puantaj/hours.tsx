"use client";

import { newIdempotencyKey, PeniApiError, type PayCloseBlockDTO, type PayCloseDTO, type PayMonthDTO, type PayPersonDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice, Sheet } from "../../kasa/ui";
import { addDaysTo, formatDay, formatMonth, parseTL, tlInput } from "../amounts";
import { Field, Segmented, Stat, useSave } from "../controls";
import { CashFrom, cashReady, defaultFrom, firstDay, FROM_WORD } from "../pay";
import { field, PanelShell, when, type PanelProps } from "../shell";
import { fill, errorText, type Lang, type T, type TextKey } from "../text";
import { hoursText } from "../vardiyalar/shifts";

/** "8", "7,5", "7.5" or "7:30" as minutes; "" as null (not entered). Undefined when it can't be read. */
export function parseHours(raw: string): number | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(v);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) : Math.round(Number(v.replace(",", ".")) * 60);
  return Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : undefined;
}

/** Minutes as the box shows them: "8", "7,5". */
function hoursInput(minutes: number | null): string {
  if (minutes === null) return "";
  return String(Math.round((minutes / 60) * 100) / 100).replace(".", ",");
}

const BLOCK: Record<PayCloseBlockDTO, TextKey | null> = {
  NOT_OVER: "payCloseNotOver",
  EARLIER_OPEN: "payCloseEarlier",
  MISSING_DAYS: "payCloseMissing",
  ALREADY_CLOSED: null,
  NO_PERMISSION: "payCloseNoPermission",
};

/**
 * Puantaj ve maaş (plan piece 21): the month's hours, pay earned and paid, per person, and
 * the pay month's close. Everyone sees their own; managers see everyone, enter hours by the
 * week from the plan, set rates and pay.
 */
export function Hours({ cafeSlug, month }: { cafeSlug: string | null; month: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="puantaj" wide>
      {(p) => <HoursPage key={p.cafe.slug} {...p} initialMonth={month} />}
    </PanelShell>
  );
}

type Open = { kind: "person"; memberId: string } | { kind: "hours" } | null;

function HoursPage({ cafe, t, lang, signedOut, initialMonth }: PanelProps & { initialMonth: string | null }) {
  const [month, setMonth] = useState<string | null>(initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : null);
  const [data, setData] = useState<PayMonthDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  useEffect(() => {
    api.staff.pay.month(cafe.slug, month ?? undefined).then(
      (d) => {
        setData(d);
        setError(null);
        window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}&ay=${d.month}`);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
    // When the month changes.
  }, [cafe.slug, month]);

  const i = data ? data.months.indexOf(data.month) : -1;
  const person = data && open?.kind === "person" ? data.people.find((p) => p.memberId === open.memberId) : undefined;
  const sheet = { t, lang, slug: cafe.slug, data: data!, onClose: () => setOpen(null), onSaved: setData };

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("pay")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t(data?.own ? "payOwnHelp" : "payHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                kind="quiet"
                size="sm"
                disabled={i < 0 || i >= data.months.length - 1}
                onClick={() => setMonth(data.months[i + 1]!)}
                aria-label={t("prevMonth")}
              >
                ←
              </Button>
              <span className="min-w-36 text-center text-lg font-semibold capitalize">{formatMonth(data.month, lang)}</span>
              <Button kind="quiet" size="sm" disabled={i <= 0} onClick={() => setMonth(data.months[i - 1]!)} aria-label={t("nextMonth")}>
                →
              </Button>
            </div>
            {!data.own && (
              <div className="flex flex-wrap gap-2">
                {data.canEditHours && !data.close && (
                  <Button kind="primary" onClick={() => setOpen({ kind: "hours" })}>
                    {t("enterHours")}
                  </Button>
                )}
                {data.canEditHours && (
                  <a
                    className="inline-flex min-h-12 items-center rounded-full border border-line px-5 font-semibold"
                    href={api.staff.pay.exportUrl(cafe.slug, data.month)}
                  >
                    {t("exportExcel")}
                  </a>
                )}
              </div>
            )}
          </section>

          {data.own ? (
            data.people[0] && <Own t={t} lang={lang} data={data} person={data.people[0]} />
          ) : (
            <>
              <dl className="flex flex-wrap gap-x-8 gap-y-4">
                <Stat label={t("statHours")} value={hoursText(data.totals.minutes, lang)} />
                <Stat label={t("statEarned")} value={formatTL(data.totals.earnedKurus)} />
                <Stat label={t("statPaid")} value={formatTL(data.totals.paidKurus)} />
                <Stat
                  label={t("statLeft")}
                  value={formatTL(data.totals.leftKurus)}
                  tone={data.totals.leftKurus && data.month < data.today.slice(0, 7) ? "red" : undefined}
                />
              </dl>
              {data.totals.missingDays > 0 && !data.close && (
                <div className="flex flex-col gap-3 rounded-3xl bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
                  <p>{fill(t("missingDays"), { n: data.totals.missingDays })}</p>
                  {data.canEditHours && (
                    <Button kind="secondary" size="sm" onClick={() => setOpen({ kind: "hours" })}>
                      {t("enterHours")}
                    </Button>
                  )}
                </div>
              )}
              <People t={t} lang={lang} data={data} onOpen={(memberId) => setOpen({ kind: "person", memberId })} />
            </>
          )}

          <Close t={t} lang={lang} slug={cafe.slug} data={data} onDone={setData} />
        </>
      )}
      {data && person && <PersonSheet {...sheet} person={person} />}
      {data && open?.kind === "hours" && <HoursSheet {...sheet} />}
    </>
  );
}

function People({ t, lang, data, onOpen }: { t: T; lang: Lang; data: PayMonthDTO; onOpen: (memberId: string) => void }) {
  return (
    <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
      {data.people.map((p) => (
        <li key={p.memberId}>
          <button
            type="button"
            onClick={() => onOpen(p.memberId)}
            className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 py-4 text-left"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2 text-lg">
                {p.name}
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{t(p.removed ? "removedFromTeam" : `role_${p.role}`)}</span>
                {p.missingDays > 0 && !data.close && (
                  <span className="rounded-full bg-tile px-2 py-0.5 text-xs font-semibold">{fill(t("missingShort"), { n: p.missingDays })}</span>
                )}
              </span>
              <span className="text-sm text-muted">
                {[
                  fill(t("workedOfPlanned"), { worked: hoursText(p.minutes, lang), planned: hoursText(p.plannedMinutes, lang) }),
                  p.rateKurus === null ? t("noRate") : fill(t("perHour"), { tl: formatTL(p.rateKurus) }),
                ].join(" · ")}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xl font-semibold tabular">{formatTL(p.earnedKurus)}</span>
              <span className={`text-xs ${p.leftKurus ? "text-muted" : p.earnedKurus ? "text-green" : "text-muted"}`}>
                {p.leftKurus ? fill(t("payLeft"), { tl: formatTL(p.leftKurus) }) : p.earnedKurus ? t("payAllPaid") : "—"}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One person's own month: their numbers, their days and what they were paid. */
function Own({ t, lang, data, person: p }: { t: T; lang: Lang; data: PayMonthDTO; person: PayPersonDTO }) {
  return (
    <>
      <dl className="flex flex-wrap gap-x-8 gap-y-4">
        <Stat label={t("statHours")} value={hoursText(p.minutes, lang)} sub={fill(t("plannedHours"), { h: hoursText(p.plannedMinutes, lang) })} />
        <Stat label={t("statRate")} value={p.rateKurus === null ? "—" : formatTL(p.rateKurus)} />
        <Stat label={t("statEarned")} value={formatTL(p.earnedKurus)} />
        <Stat label={t("statPaid")} value={formatTL(p.paidKurus)} />
      </dl>
      <Days t={t} lang={lang} data={data} person={p} />
      <Payouts t={t} lang={lang} person={p} busy={false} onUndo={null} />
    </>
  );
}

/** Each day with a plan or hours: "Pzt 12 Eki · plan 8 sa · 8 sa". */
function Days({ t, lang, data, person: p }: { t: T; lang: Lang; data: PayMonthDTO; person: PayPersonDTO }) {
  const rows = data.days.map((day, i) => ({ day, planned: p.planned[i]!, worked: p.worked[i] ?? null })).filter((d) => d.planned || d.worked !== null);
  if (!rows.length) return <p className="text-sm text-muted">{t("noDays")}</p>;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm text-muted">{t("days")}</h3>
      <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {rows.map((d) => {
          const missing = d.worked === null && d.day < data.today;
          return (
            <li key={d.day} className="flex items-center justify-between gap-4 py-2.5">
              <span className="flex flex-col">
                <span>{formatDay(d.day, lang)}</span>
                {d.planned > 0 && <span className="text-xs text-muted">{fill(t("plannedHours"), { h: hoursText(d.planned, lang) })}</span>}
              </span>
              <span className={`tabular ${missing ? "text-red" : d.worked === null ? "text-muted" : ""}`}>
                {d.worked === null ? (missing ? t("notEntered") : "—") : hoursText(d.worked, lang)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Payouts({ t, lang, person: p, busy, onUndo }: { t: T; lang: Lang; person: PayPersonDTO; busy: boolean; onUndo: ((id: string) => void) | null }) {
  if (!p.payouts.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm text-muted">{t("payouts")}</h3>
      <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {p.payouts.map((x) => (
          <li key={x.id} className="flex items-center justify-between gap-4 py-3">
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold tabular">{formatTL(x.amountKurus)}</span>
              <span className="text-sm text-muted">
                {[
                  t(x.method === "cash" ? "payCash" : "payBank"),
                  x.account && x.method === "cash" ? t(FROM_WORD[x.account]) : null,
                  formatDay(x.paidOn, lang),
                  x.by,
                  x.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {onUndo && x.canRemove && (
              <Button kind="bare" size="sm" disabled={busy} onClick={() => onUndo(x.id)}>
                {t("undo")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type SheetProps = { t: T; lang: Lang; slug: string; data: PayMonthDTO; onClose: () => void; onSaved: (d: PayMonthDTO) => void };

/** A person's month: pay them, change their rate, see their days. */
function PersonSheet({ t, lang, slug, data, person: p, onClose, onSaved }: SheetProps & { person: PayPersonDTO }) {
  const key = useRef(newIdempotencyKey());
  const [amount, setAmount] = useState(tlInput(p.leftKurus || null));
  const [method, setMethod] = useState<"cash" | "bank">("bank");
  const [from, setFrom] = useState(defaultFrom(data.cashFrom));
  const [paidOn, setPaidOn] = useState(data.today);
  const [note, setNote] = useState("");
  const [rate, setRate] = useState("");
  const firstOpen = useMemo(() => {
    const after = [data.payClosedThrough, data.closedThrough]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    const monthStart = `${data.month}-01`;
    return after && addDaysTo(after, 1) > monthStart ? addDaysTo(after, 1) : monthStart;
  }, [data]);
  const [rateFrom, setRateFrom] = useState(firstOpen);
  const save = useSave<PayMonthDTO>(lang, (d) => {
    key.current = newIdempotencyKey();
    const next = d.people.find((x) => x.memberId === p.memberId);
    setAmount(tlInput(next?.leftKurus || null));
    setNote("");
    setRate("");
    onSaved(d);
  });
  const amountKurus = parseTL(amount);
  const ok = amountKurus !== null && amountKurus > 0 && amountKurus <= p.leftKurus;
  const rateKurus = parseTL(rate);

  return (
    <Sheet title={p.name} onClose={onClose} labelClose={t("close")} wide>
      <dl className="-mt-2 flex flex-wrap gap-x-8 gap-y-4">
        <Stat label={t("statHours")} value={hoursText(p.minutes, lang)} sub={fill(t("plannedHours"), { h: hoursText(p.plannedMinutes, lang) })} />
        <Stat label={t("statEarned")} value={formatTL(p.earnedKurus)} />
        <Stat label={t("statPaid")} value={formatTL(p.paidKurus)} />
        <Stat label={t("statLeft")} value={formatTL(p.leftKurus)} />
      </dl>

      {data.canPay && p.leftKurus > 0 && (
        <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <h3 className="font-semibold">{fill(t("payFor"), { month: formatMonth(data.month, lang) })}</h3>
          <Segmented
            label={t("repayHow")}
            value={method}
            onChange={setMethod}
            options={[
              { value: "bank", label: t("payBank") },
              { value: "cash", label: t("payCash") },
            ]}
          />
          {method === "cash" && data.cashFrom && <CashFrom t={t} cashFrom={data.cashFrom} value={from} onChange={setFrom} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("payAmount")} value={amount} onChange={setAmount} inputMode="decimal" suffix="₺" />
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("paidOn")}
              <input
                type="date"
                className={`${field} min-h-12`}
                value={paidOn}
                min={firstDay(data.closedThrough, `${data.month}-01`)}
                max={data.today}
                onChange={(e) => setPaidOn(e.target.value)}
              />
            </label>
          </div>
          <Field label={t("moneyNoteOptional")} value={note} onChange={setNote} maxLength={200} />
          <div>
            <Button
              kind="primary"
              disabled={!ok || !paidOn || (method === "cash" && !cashReady(data.cashFrom)) || save.busy}
              onClick={() =>
                save.run(() =>
                  api.staff.pay.payout(slug, {
                    key: key.current,
                    memberId: p.memberId,
                    month: data.month,
                    amountKurus: amountKurus!,
                    method,
                    paidOn,
                    ...(method === "cash" && data.cashFrom ? { from } : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  }),
                )
              }
            >
              {t("payNow")} · {formatTL(ok ? amountKurus! : 0)}
            </Button>
          </div>
        </section>
      )}

      <Payouts t={t} lang={lang} person={p} busy={save.busy} onUndo={data.canPay ? (id) => save.run(() => api.staff.pay.removePayout(slug, id)) : null} />

      <section className="flex flex-col gap-3">
        <h3 className="text-sm text-muted">{t("rates")}</h3>
        {p.rates.length === 0 ? (
          <p className="text-sm text-muted">{t("noRate")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {p.rates.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold tabular">{fill(t("perHour"), { tl: formatTL(r.kurusPerHour) })}</span>
                  <span className="text-sm text-muted">{fill(t("rateFrom"), { day: formatDay(r.fromDay, lang, { year: true }) })}</span>
                </span>
                {r.canRemove && (
                  <Button kind="bare" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.pay.removeRate(slug, data.month, r.id))}>
                    {t("undo")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.canEditHours && !p.removed && (
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <Field label={t("newRate")} value={rate} onChange={setRate} inputMode="decimal" suffix="₺" />
            <label className="flex flex-col gap-2 text-sm text-muted">
              {t("rateStarts")}
              <input type="date" className={`${field} min-h-12`} value={rateFrom} min={firstOpen} onChange={(e) => setRateFrom(e.target.value)} />
            </label>
            <Button
              kind="secondary"
              disabled={rateKurus === null || rateKurus <= 0 || !rateFrom || save.busy}
              onClick={() => save.run(() => api.staff.pay.setRate(slug, data.month, { memberId: p.memberId, kurusPerHour: rateKurus!, fromDay: rateFrom }))}
            >
              {t("setRate")}
            </Button>
          </div>
        )}
      </section>

      <Days t={t} lang={lang} data={data} person={p} />
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </Sheet>
  );
}

/** The month's weeks, Monday first, cut to the month. */
function weeksOf(days: string[]): string[][] {
  const out: string[][] = [];
  for (const day of days) {
    const monday = new Date(`${day}T12:00:00Z`).getUTCDay() === 1;
    if (monday || !out.length) out.push([]);
    out.at(-1)!.push(day);
  }
  return out;
}

/**
 * "Saatleri gir": a week at a time, everyone on the team by the days. An empty box is a
 * day not entered yet; the plan shows in it until something is typed. "Plandaki gibi"
 * fills the empty ones from the plan.
 */
function HoursSheet({ t, lang, slug, data, onClose, onSaved }: SheetProps) {
  const weeks = useMemo(() => weeksOf(data.days), [data.days]);
  const people = data.people.filter((p) => !p.removed);
  const firstMissing = data.days.findIndex((d, i) => d < data.today && people.some((p) => p.planned[i]! > 0 && p.worked[i] === null));
  const startDay = firstMissing >= 0 ? data.days[firstMissing]! : data.days.includes(data.today) ? data.today : data.days.at(-1)!;
  const [w, setW] = useState(
    Math.max(
      0,
      weeks.findIndex((x) => x.includes(startDay)),
    ),
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(0);
  // Close once nothing is left to enter; otherwise stay open for the next week.
  const save = useSave<PayMonthDTO>(lang, (d) => {
    setValues({});
    onSaved(d);
    if (d.totals.missingDays === 0) onClose();
    else setSaved(d.totals.missingDays);
  });
  const week = weeks[w] ?? [];
  const index = (day: string) => data.days.indexOf(day);
  const locked = (day: string) =>
    day > data.today || (!!data.payClosedThrough && day <= data.payClosedThrough) || (!!data.closedThrough && day <= data.closedThrough);
  const cell = (memberId: string, day: string) => `${memberId}|${day}`;
  const shown = (p: PayPersonDTO, day: string) => values[cell(p.memberId, day)] ?? hoursInput(p.worked[index(day)] ?? null);

  const changes = Object.entries(values)
    .map(([k, v]) => {
      const [memberId, day] = k.split("|") as [string, string];
      const p = people.find((x) => x.memberId === memberId)!;
      return { memberId, day, minutes: parseHours(v), before: p.worked[index(day)] ?? null };
    })
    .filter((c) => c.minutes !== c.before);
  const bad = changes.some((c) => c.minutes === undefined);

  const fromPlan = () => {
    const next = { ...values };
    for (const p of people)
      for (const day of week) {
        const i = index(day);
        if (!locked(day) && p.planned[i]! > 0 && shown(p, day) === "") next[cell(p.memberId, day)] = hoursInput(p.planned[i]!);
      }
    setValues(next);
  };

  return (
    <Sheet title={t("enterHours")} onClose={onClose} labelClose={t("close")} wide>
      <p className="-mt-2 text-sm leading-normal text-muted">{t("enterHoursHelp")}</p>
      <div className="flex flex-wrap gap-2">
        {weeks.map((x, i) => (
          <button
            key={x[0]}
            type="button"
            aria-pressed={i === w}
            onClick={() => setW(i)}
            className={`min-h-11 cursor-pointer rounded-full border px-4 text-sm font-semibold ${i === w ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink"}`}
          >
            {formatDay(x[0]!, lang)}–{formatDay(x.at(-1)!, lang).split(" ")[0]}
          </button>
        ))}
      </div>
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr>
              <th className="pr-2 text-left font-normal text-muted" />
              {week.map((day) => (
                <th key={day} className="px-1 pb-1 text-center font-normal text-muted">
                  <span className="block capitalize">
                    {new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", timeZone: "UTC" })}
                  </span>
                  <span className="block">{formatDay(day, lang).split(" ")[0]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.memberId}>
                <th scope="row" className="pr-2 text-left font-semibold whitespace-nowrap">
                  {p.name.split(" ")[0]}
                </th>
                {week.map((day) => {
                  const i = index(day);
                  const v = shown(p, day);
                  const planned = p.planned[i]!;
                  return (
                    <td key={day} className="px-1">
                      <input
                        aria-label={`${p.name} · ${formatDay(day, lang)}`}
                        inputMode="decimal"
                        disabled={locked(day)}
                        value={v}
                        placeholder={planned ? hoursInput(planned) : "–"}
                        onChange={(e) => setValues((x) => ({ ...x, [cell(p.memberId, day)]: e.target.value }))}
                        className={`${field} h-11 w-full min-w-12 px-2 text-center tabular disabled:opacity-40 ${
                          parseHours(v) === undefined ? "border-red" : v === "" && planned && day < data.today ? "border-ink" : ""
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bad && <Notice tone="red">{t("hoursBad")}</Notice>}
      {save.error && <Notice tone="red">{save.error}</Notice>}
      {!!saved && !changes.length && !save.error && <Notice>{fill(t("hoursSavedLeft"), { n: saved })}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          kind="primary"
          disabled={!changes.length || bad || save.busy}
          onClick={() =>
            save.run(() =>
              api.staff.pay.setHours(slug, data.month, {
                days: changes.map((c) => ({ memberId: c.memberId, day: c.day, minutes: c.minutes as number | null })),
              }),
            )
          }
        >
          {changes.length ? fill(t("saveDays"), { n: changes.length }) : t("save")}
        </Button>
        <Button kind="quiet" onClick={fromPlan}>
          {t("fillFromPlan")}
        </Button>
      </div>
    </Sheet>
  );
}

/** The pay month's close: what stands, or the button, or why not yet. */
function Close({ t, lang, slug, data, onDone }: { t: T; lang: Lang; slug: string; data: PayMonthDTO; onDone: (d: PayMonthDTO) => void }) {
  const [note, setNote] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const save = useSave<PayMonthDTO>(lang, (d) => {
    setNote("");
    setReason("");
    setReopening(false);
    onDone(d);
  });
  const why = data.closeBlock ? BLOCK[data.closeBlock] : null;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-serif text-3xl">{t("payClose")}</h2>
      {data.close ? (
        <div className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
          <ClosedLine t={t} lang={lang} close={data.close} />
          {data.close.canReopen &&
            (reopening ? (
              <div className="flex flex-col gap-4 rounded-3xl border border-line bg-paper p-5">
                <p className="text-sm leading-normal text-muted">{t("payReopenHelp")}</p>
                <Field label={t("reopenWhy")} value={reason} onChange={setReason} placeholder={t("payReopenPlaceholder")} maxLength={200} autoFocus />
                {save.error && <Notice tone="red">{save.error}</Notice>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    kind="danger"
                    disabled={!reason.trim() || save.busy}
                    onClick={() => save.run(() => api.staff.pay.reopen(slug, data.close!.id, { reason: reason.trim() }))}
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
      ) : data.canClose ? (
        <div className="flex flex-col gap-4 rounded-3xl border border-line p-5">
          <p className="text-sm leading-normal text-muted">{t("payCloseHelp")}</p>
          <Field label={t("moneyNoteOptional")} value={note} onChange={setNote} placeholder={t("payClosePlaceholder")} maxLength={200} />
          {save.error && <Notice tone="red">{save.error}</Notice>}
          <div>
            <Button
              kind="primary"
              disabled={save.busy}
              onClick={() => save.run(() => api.staff.pay.close(slug, { month: data.month, ...(note.trim() ? { note: note.trim() } : {}) }))}
            >
              {fill(t("closeMonth"), { month: formatMonth(data.month, lang) })}
            </Button>
          </div>
        </div>
      ) : (
        why && <p className="text-sm text-muted">{fill(t(why), { n: data.totals.missingDays })}</p>
      )}
      {data.history.map((c) => (
        <div key={c.id} className="rounded-3xl border border-line-soft p-5">
          <ClosedLine t={t} lang={lang} close={c} />
        </div>
      ))}
    </section>
  );
}

function ClosedLine({ t, lang, close: c }: { t: T; lang: Lang; close: PayCloseDTO }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.reopenedAt ? "bg-tile text-ink" : "bg-green-soft text-green"}`}>
          {t(c.reopenedAt ? "reopened" : "standing")}
        </span>
        <span className="text-sm text-muted">
          {fill(t("closedBy"), { by: c.by ?? "", when: when(c.closedAt, lang) })}
          {c.note && ` · ${c.note}`}
        </span>
      </span>
      <span className="text-sm text-muted">
        {fill(t("payCloseSummary"), { h: hoursText(c.summary.minutes, lang), earned: formatTL(c.summary.earnedKurus), paid: formatTL(c.summary.paidKurus) })}
      </span>
      {c.reopenedAt && <span className="text-sm text-muted">{fill(t("reopenedBy"), { by: c.reopenedBy ?? "", reason: c.reopenReason ?? "" })}</span>}
    </div>
  );
}
