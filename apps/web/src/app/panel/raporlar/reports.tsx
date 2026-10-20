"use client";

import { PeniApiError, type ChatSubjectDTO, type ExpenseKindDTO, type ReportProductDTO, type SalesReportDTO, type SavedReportsDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { addDaysTo, formatDay, formatMonth, rangeLabel, shiftMonth } from "../amounts";
import { AskedReportView } from "../asked-report";
import { SAVED_REPORTS_EVENT, useAssistant } from "../assistant";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { change, compactTL, signedPercent } from "../chart";
import { ChartContainer, ChartLegend, ChartTooltip, useFillId, type ChartConfig } from "../ui-chart";
import { Segmented } from "../controls";
import { CATEGORY } from "../faturalar/bills";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";
import { withCafe } from "../bugun/today";

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "90" | "year" | "custom";
type Range = { from: string; through: string };
type Sort = "profit" | "qty" | "sales";
type Section = Extract<ChatSubjectDTO, { kind: "report" }>["section"];

/** What each part is called when "Açıkla" asks about it. */
const SECTION_TITLE: Record<Section, TextKey> = {
  headline: "xpHeadline",
  sales: "rpSalesChart",
  hours: "rpByHour",
  weekdays: "rpByWeekday",
  months: "rpMonths",
  spending: "rpSpendTitle",
  paidWith: "rpPaidWith",
  products: "rpProducts",
};
/** The days on screen, for "Açıkla". */
const Shown = createContext<{ range: Range; t: T; lang: Lang } | null>(null);

const PRESETS: { value: Preset; label: TextKey }[] = [
  { value: "today", label: "rpToday" },
  { value: "yesterday", label: "rpYesterday" },
  { value: "week", label: "rpWeek" },
  { value: "month", label: "rpMonth" },
  { value: "lastMonth", label: "rpLastMonth" },
  { value: "90", label: "rp90" },
  { value: "year", label: "rpYear" },
  { value: "custom", label: "rpCustom" },
];
const TOP = 10;
/** Report figures in whole lira; a unit cost keeps its kuruş. */
const lira = (kurus: number) => formatTL(Math.round(kurus / 100) * 100);

function rangeOf(preset: Exclude<Preset, "custom">, today: string): Range {
  const monday = addDaysTo(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  switch (preset) {
    case "today":
      return { from: today, through: today };
    case "yesterday":
      return { from: addDaysTo(today, -1), through: addDaysTo(today, -1) };
    case "week":
      return { from: monday, through: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, through: today };
    case "lastMonth": {
      const m = shiftMonth(today.slice(0, 7), -1);
      return { from: `${m}-01`, through: addDaysTo(`${today.slice(0, 7)}-01`, -1) };
    }
    case "90":
      return { from: addDaysTo(today, -89), through: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, through: today };
  }
}

function presetOf(r: Range, today: string): Preset {
  for (const p of PRESETS) if (p.value !== "custom" && sameRange(rangeOf(p.value, today), r)) return p.value;
  return "custom";
}
const sameRange = (a: Range, b: Range) => a.from === b.from && a.through === b.through;

const percent = (n: number, lang: Lang) => (lang === "tr" ? `%${n}` : `${n}%`);

/**
 * Raporlar (plan piece 23): one page for any period. The numbers on top, then when it sold,
 * month by month, where the money went, and which products earn the most.
 */
export function Reports({ cafeSlug, from, through }: { cafeSlug: string | null; from: string | null; through: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="raporlar" wide>
      {(p) => <ReportsPage key={p.cafe.slug} {...p} initial={from && through ? { from, through } : null} />}
    </PanelShell>
  );
}

function ReportsPage({ cafe, t, lang, signedOut, initial }: PanelProps & { initial: Range | null }) {
  const [range, setRange] = useState<Range | null>(initial);
  const [data, setData] = useState<SalesReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<Range | null>(null);

  useEffect(() => {
    setBusy(true);
    api.staff.reports.get(cafe.slug, range ?? undefined).then(
      (d) => {
        setData(d);
        setError(null);
        setBusy(false);
      },
      (e: unknown) => {
        setBusy(false);
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
  }, [cafe.slug, range?.from, range?.through]);

  const pick = (r: Range) => {
    setRange(r);
    // A reload stays on these days.
    window.history.replaceState(null, "", `?kafe=${encodeURIComponent(cafe.slug)}&from=${r.from}&through=${r.through}`);
  };
  const shown: Range | null = data ? { from: data.from, through: data.through } : null;
  const preset = custom ? "custom" : shown && data ? presetOf(shown, data.today) : "month";

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("rpTitle")}</h1>
        <p className="leading-normal text-muted">{t("rpHelp")}</p>
      </section>

      {data && (
        <section className="flex flex-col gap-4">
          <Segmented
            label={t("rpPeriod")}
            value={preset}
            options={PRESETS.map((p) => ({ value: p.value, label: t(p.label) }))}
            onChange={(v) => {
              if (v === "custom") setCustom(shown);
              else {
                setCustom(null);
                pick(rangeOf(v, data.today));
              }
            }}
          />
          {custom && (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                pick(custom);
              }}
            >
              <DateField label={t("rpFrom")} value={custom.from} max={data.today} onChange={(from) => setCustom({ ...custom, from })} />
              <DateField label={t("rpThrough")} value={custom.through} max={data.today} onChange={(through) => setCustom({ ...custom, through })} />
              <Button kind="primary" size="sm" type="submit" disabled={busy || custom.from > custom.through}>
                {t("rpShow")}
              </Button>
            </form>
          )}
          <p className="text-sm text-muted">
            <span className="font-semibold text-ink">{rangeLabel(shown!, lang)}</span> ·{" "}
            {data.previous.untilTime
              ? fill(t("rpVsUntil"), { prev: rangeLabel(data.previous, lang), time: data.previous.untilTime })
              : fill(t("rpVs"), { prev: rangeLabel(data.previous, lang) })}
          </p>
        </section>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      {data && <Report data={data} t={t} lang={lang} slug={cafe.slug} busy={busy} />}
      {data && <SavedReports t={t} lang={lang} slug={cafe.slug} signedOut={signedOut} />}
    </>
  );
}

function DateField({ label, value, max, onChange }: { label: string; value: string; max: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted">
      {label}
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="min-h-11 rounded-2xl border border-line bg-paper px-4 text-base text-ink"
      />
    </label>
  );
}

function Report({ data, t, lang, slug, busy }: { data: SalesReportDTO; t: T; lang: Lang; slug: string; busy: boolean }) {
  const tl = lira;
  // One day is already hour by hour in the sales chart.
  const showHours = data.hours.length > 0 && data.series.step !== "hour";
  return (
    <Shown.Provider value={{ range: { from: data.from, through: data.through }, t, lang }}>
      <div className={`flex flex-col gap-10 transition-opacity ${busy ? "opacity-60" : ""}`} aria-busy={busy}>
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Explain section="headline" />
          </div>
          <Headline data={data} t={t} lang={lang} />
        </div>
        <SalesChart data={data} t={t} lang={lang} />
        {(showHours || data.weekdays.length > 0) && (
          <div className={`grid gap-10 ${showHours && data.weekdays.length > 0 ? "md:grid-cols-2" : ""}`}>
            {showHours && <HoursChart data={data} t={t} />}
            {data.weekdays.length > 0 && <WeekdayChart data={data} t={t} lang={lang} />}
          </div>
        )}
        {data.months.length > 0 && <MonthsChart data={data} t={t} lang={lang} />}
        <div className="grid gap-10 md:grid-cols-2">
          <Spending data={data} t={t} tl={tl} />
          <PaidWith data={data} t={t} />
        </div>
        <Products data={data} t={t} lang={lang} tl={tl} slug={slug} />
      </div>
    </Shown.Provider>
  );
}

function Heading({ title, help, section }: { title: string; help?: string; section?: Section }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-serif text-3xl leading-tight">{title}</h2>
        {section && <Explain section={section} />}
      </div>
      {help && <p className="text-sm leading-normal text-muted">{help}</p>}
    </div>
  );
}

/** "Açıkla" (B8): the assistant reads this part of the report in plain words. */
function Explain({ section }: { section: Section }) {
  const assistant = useAssistant();
  const shown = useContext(Shown);
  if (!assistant || !shown) return null;
  const { range, t, lang } = shown;
  return (
    <Button
      kind="quiet"
      size="sm"
      className="shrink-0"
      onClick={() =>
        assistant.open({
          text: fill(t("xpAsk"), { what: t(SECTION_TITLE[section]), period: rangeLabel(range, lang) }),
          subject: { kind: "report", section, ...range },
        })
      }
    >
      <SparkIcon />
      {t("xpExplain")}
    </Button>
  );
}

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />
    </svg>
  );
}

function Headline({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const n = data.totals;
  const p = data.previousTotals;
  const card = (label: string, help: string, value: number, before: number, good: "up" | "down", extra?: string) => {
    const c = change(value, before);
    const better = c === null || c === 0 ? null : c > 0 === (good === "up");
    return (
      <div className="flex flex-col gap-1 rounded-3xl border border-line p-5" title={help}>
        <dt className="text-sm text-muted">{label}</dt>
        <dd className={`font-serif text-4xl leading-tight tabular ${label === t("rpProfit") && value < 0 ? "text-red" : ""}`}>{lira(value)}</dd>
        <dd className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {c !== null && (
            <span className={`font-semibold tabular ${better === null ? "text-muted" : better ? "text-green" : "text-red"}`}>{signedPercent(c, lang)}</span>
          )}
          <span className="text-muted">{fill(t("rpBefore"), { v: lira(before) })}</span>
        </dd>
        {extra && <dd className="text-sm text-muted">{extra}</dd>}
        <dd className="mt-1 text-xs leading-normal text-muted">{help}</dd>
      </div>
    );
  };
  const oc = change(n.orders, p.orders);
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {card(t("rpSales"), t("rpSalesHelp"), n.salesKurus, p.salesKurus, "up")}
      {card(t("rpExpenses"), t("rpExpensesHelp"), n.expensesKurus, p.expensesKurus, "down")}
      {card(t("rpProfit"), t("rpProfitHelp"), n.profitKurus, p.profitKurus, "up")}
      <div className="flex flex-col gap-1 rounded-3xl border border-line p-5">
        <dt className="text-sm text-muted">{t("rpOrders")}</dt>
        <dd className="font-serif text-4xl leading-tight tabular">{n.orders.toLocaleString(locale)}</dd>
        <dd className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {oc !== null && (
            <span className={`font-semibold tabular ${oc === 0 ? "text-muted" : oc > 0 ? "text-green" : "text-red"}`}>{signedPercent(oc, lang)}</span>
          )}
          <span className="text-muted">{fill(t("rpBefore"), { v: p.orders.toLocaleString(locale) })}</span>
        </dd>
        {n.avgOrderKurus !== null && <dd className="text-sm text-muted">{fill(t("rpAvg"), { avg: lira(n.avgOrderKurus) })}</dd>}
      </div>
    </dl>
  );
}

/** "08:00", "16 Eki", "12 Eki haftası", "Eylül"; with `year`, a month reads "Eki 2025". */
function pointLabel(key: string, step: SalesReportDTO["series"]["step"], lang: Lang, year = false): string {
  if (step === "hour") return `${key}:00`;
  if (step === "day") return formatDay(key, lang);
  if (step === "week") return formatDay(key, lang);
  return new Date(`${key}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
}

const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

function SalesChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const { step, points } = data.series;
  const fillId = useFillId("sales");
  // The legend says which days are compared ("1–20 Eki", "1–20 Eyl"), not just "this" and "before".
  const config = {
    sales: { label: rangeLabel(data, lang), color: "var(--ink)" },
    previous: { label: rangeLabel(data.previous, lang), color: "var(--mark)" },
  } satisfies ChartConfig;
  const day = (d: string, key: string) => (step === "hour" ? `${formatDay(d, lang)} ${pointLabel(key, step, lang)}` : pointLabel(key, step, lang, true));
  const rows = points.map((p) => ({
    x: pointLabel(p.key, step, lang),
    now: day(data.from, p.key),
    before: p.previousKey === null ? null : day(data.previous.from, p.previousKey),
    sales: p.salesKurus / 100,
    previous: p.previousKurus === null ? null : p.previousKurus / 100,
  }));
  const total = points.reduce((s, p) => s + p.salesKurus, 0);
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpSalesChart")} section="sales" />
      {total === 0 && points.every((p) => !p.previousKurus) ? (
        <p className="rounded-3xl bg-panel px-5 py-6">{t("rpNoSales")}</p>
      ) : (
        <ChartContainer config={config} height={280} label={`${t("rpSalesChart")}: ${lira(total)}`}>
          <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="x" {...AXIS} minTickGap={24} />
            <YAxis {...AXIS} width={64} tickFormatter={(v: number) => compactTL(v * 100, lang)} />
            <ChartTooltip config={config} format={(v) => lira(v * 100)} rowLabel={(key, row) => String((key === "sales" ? row.now : row.before) ?? "")} />
            <ChartLegend config={config} dashed={["previous"]} />
            <Area dataKey="previous" type="monotone" stroke="var(--color-previous)" strokeWidth={2} strokeDasharray="4 4" fill="none" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
            <Area dataKey="sales" type="monotone" stroke="var(--color-sales)" strokeWidth={2} fill={`url(#${fillId})`} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}

function HoursChart({ data, t }: { data: SalesReportDTO; t: T }) {
  const busiest = data.hours.reduce((a, b) => (b.orders > a.orders ? b : a), data.hours[0]!);
  const config = { orders: { label: t("rpOrders"), color: "var(--ink)" } } satisfies ChartConfig;
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpByHour")} help={t("rpByHourHelp")} section="hours" />
      <ChartContainer config={config} height={220} label={`${t("rpByHour")}: ${busiest.hour}:00`}>
        <BarChart data={data.hours.map((h) => ({ x: h.hour, orders: h.orders }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" {...AXIS} />
          <YAxis {...AXIS} width={36} allowDecimals={false} />
          <ChartTooltip config={config} format={(v) => String(v)} line={false} />
          <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.hours.map((h) => (
              <Cell key={h.hour} fill={h.hour === busiest.hour ? "var(--green)" : "var(--color-orders)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <Note>{fill(t("rpBusiestNote"), { h: busiest.hour, n: busiest.orders })}</Note>
    </section>
  );
}

/** "Cumartesi": the whole name of a weekday, 1 for Monday to 7 for Sunday. */
function weekdayName(weekday: number, lang: Lang): string {
  // 19 October 2026 is a Monday.
  return new Date(Date.UTC(2026, 9, 18 + weekday, 12)).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", timeZone: "UTC" });
}

/** What the green bar means, under the chart, with a swatch of it. */
function Note({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px] bg-green" />
      {children}
    </p>
  );
}

function WeekdayChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const best = data.weekdays.reduce((a, b) => (b.avgKurus > a.avgKurus ? b : a), data.weekdays[0]!);
  const config = { sales: { label: t("rpSales"), color: "var(--ink)" } } satisfies ChartConfig;
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpByWeekday")} help={t("rpByWeekdayHelp")} section="weekdays" />
      <ChartContainer config={config} height={220} label={`${t("rpByWeekday")}: ${t(`wd_${best.weekday}` as TextKey)}`}>
        <BarChart data={data.weekdays.map((w) => ({ x: t(`wd_${w.weekday}` as TextKey), sales: w.avgKurus / 100 }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v: number) => compactTL(v * 100, lang)} />
          <ChartTooltip config={config} format={(v) => lira(v * 100)} line={false} />
          <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.weekdays.map((w) => (
              <Cell key={w.weekday} fill={w.weekday === best.weekday ? "var(--green)" : "var(--color-sales)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
      <Note>{fill(t("rpBestDayNote"), { d: weekdayName(best.weekday, lang), v: lira(best.avgKurus) })}</Note>
    </section>
  );
}

function MonthsChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const thisMonth = data.today.slice(0, 7);
  const label = (m: string) => {
    const name = new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "short", timeZone: "UTC" });
    return m === thisMonth ? fill(t("rpThisMonthSoFar"), { m: name }) : name;
  };
  const config = {
    sales: { label: t("rpSales"), color: "var(--ink)" },
    expenses: { label: t("rpExpenses"), color: "var(--mark)" },
    left: { label: t("rpLeftOver"), color: "var(--green)" },
  } satisfies ChartConfig;
  const rows = data.months.map((m) => ({ x: label(m.month), sales: m.salesKurus / 100, expenses: m.expensesKurus / 100, left: m.profitKurus / 100 }));
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpMonths")} help={t("rpMonthsHelp")} section="months" />
      <ChartContainer config={config} height={260} label={data.months.map((m) => `${formatMonth(m.month, lang)}: ${lira(m.profitKurus)}`).join(", ")}>
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="x" {...AXIS} />
          <YAxis {...AXIS} width={64} tickFormatter={(v: number) => compactTL(v * 100, lang)} />
          <ChartTooltip config={config} format={(v) => lira(v * 100)} />
          <ChartLegend config={config} />
          <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Line dataKey="left" type="monotone" stroke="var(--color-left)" strokeWidth={2} dot={{ r: 3.5, fill: "var(--color-left)", strokeWidth: 0 }} isAnimationActive={false} />
        </ComposedChart>
      </ChartContainer>
    </section>
  );
}

function Bars({ rows }: { rows: { key: string; label: string; kurus: number; tone?: "mark" }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.kurus)));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span>{r.label}</span>
            <span className="font-semibold tabular">{lira(r.kurus)}</span>
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-tile" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${r.tone === "mark" ? "bg-mark" : "bg-ink"}`}
              style={{ width: `${Math.round((Math.abs(r.kurus) / max) * 100)}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Spending({ data, t, tl }: { data: SalesReportDTO; t: T; tl: (k: number) => string }) {
  const label = (k: ExpenseKindDTO) => t(CATEGORY[k]);
  return (
    <section className="flex flex-col gap-4">
      <Heading title={t("rpSpendTitle")} help={`${t("rpExpensesHelp")} ${tl(data.totals.expensesKurus)}`} section="spending" />
      {data.expenses.length === 0 ? (
        <p className="text-muted">{t("rpNoSpend")}</p>
      ) : (
        <Bars rows={data.expenses.map((e) => ({ key: e.kind, label: label(e.kind), kurus: e.kurus }))} />
      )}
    </section>
  );
}

function PaidWith({ data, t }: { data: SalesReportDTO; t: T }) {
  const w = data.paidWith;
  const rows = [
    { key: "cash", label: t("rpCash"), kurus: w.cashKurus },
    { key: "card", label: t("rpCard"), kurus: w.cardKurus },
    { key: "peni", label: t("rpPeni"), kurus: w.peniKurus, tone: "mark" as const },
    { key: "askida", label: t("rpAskida"), kurus: w.askidaKurus, tone: "mark" as const },
  ].filter((r) => r.kurus !== 0 || r.key === "cash" || r.key === "card");
  return (
    <section className="flex flex-col gap-4">
      <Heading title={t("rpPaidWith")} help={t("rpPaidWithHelp")} section="paidWith" />
      <Bars rows={rows} />
    </section>
  );
}

function Products({ data, t, lang, tl, slug }: { data: SalesReportDTO; t: T; lang: Lang; tl: (k: number) => string; slug: string }) {
  const [sort, setSort] = useState<Sort>("profit");
  const [all, setAll] = useState(false);
  const rows: ReportProductDTO[] =
    sort === "profit"
      ? data.products
      : [...data.products].sort((a, b) => (sort === "qty" ? b.quantity - a.quantity : b.salesKurus - a.salesKurus) || b.salesKurus - a.salesKurus);
  const shown = all ? rows : rows.slice(0, TOP);
  if (data.products.length === 0)
    return (
      <section className="flex flex-col gap-3">
        <Heading title={t("rpProducts")} />
        <p className="text-muted">{t("rpNoSales")}</p>
      </section>
    );
  return (
    <section className="flex flex-col gap-4">
      <Heading title={t("rpProducts")} help={t("rpProductsHelp")} section="products" />
      <Segmented
        label={t("rpSortBy")}
        value={sort}
        options={[
          { value: "profit", label: t("rpSortProfit") },
          { value: "qty", label: t("rpSortQty") },
          { value: "sales", label: t("rpSortSales") },
        ]}
        onChange={setSort}
      />
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th className="py-2 pr-3 font-normal">{t("rpProduct")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("rpQty")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("rpSales")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("rpCost")}</th>
              <th className="py-2 pr-3 text-right font-normal">{t("rpProductProfit")}</th>
              <th className="py-2 text-right font-normal">{t("rpMargin")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={p.productId} className="border-b border-line-soft">
                <td className="py-3 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-sm text-muted tabular">{i + 1}</span>
                    <span className="font-semibold">{p.name}</span>
                  </span>
                </td>
                <td className="py-3 pr-3 text-right tabular">{p.quantity}</td>
                <td className="py-3 pr-3 text-right tabular">{tl(p.salesKurus)}</td>
                <td className="py-3 pr-3 text-right tabular">
                  {p.unitCostKurus === null ? <span className="text-sm text-red">{t("rpNoCost")}</span> : formatTL(p.unitCostKurus)}
                </td>
                <td className={`py-3 pr-3 text-right font-semibold tabular ${p.profitKurus !== null && p.profitKurus < 0 ? "text-red" : ""}`}>
                  {p.profitKurus === null ? "—" : tl(p.profitKurus)}
                </td>
                <td className="py-3 text-right tabular text-muted">{p.marginPercent === null ? "—" : percent(p.marginPercent, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > TOP && (
        <Button kind="quiet" size="sm" className="self-start" onClick={() => setAll(!all)}>
          {all ? t("rpShowFewer") : fill(t("rpShowAll"), { n: rows.length })}
        </Button>
      )}
      {data.unpriced > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-normal text-muted">
          {fill(t("rpUnpriced"), { n: data.unpriced })}
          <a href={withCafe("/panel/menu", slug)} className="font-semibold text-ink underline underline-offset-4">
            {t("rpFixCosts")}
          </a>
        </p>
      )}
    </section>
  );
}

/**
 * Kayıtlı raporlar (B9): reports asked for in the chat and kept here for everyone who sees
 * reports. Named periods move with the calendar, so each opens with today's numbers.
 */
function SavedReports({ t, lang, slug, signedOut }: { t: T; lang: Lang; slug: string; signedOut: () => void }) {
  const assistant = useAssistant();
  const [data, setData] = useState<SavedReportsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const failed = (e: unknown) => {
    if (e instanceof PeniApiError && e.status === 401) signedOut();
    else setError(errorText(e, lang));
  };
  useEffect(() => {
    const load = () => api.staff.reports.saved(slug).then(setData, failed);
    load();
    window.addEventListener(SAVED_REPORTS_EVENT, load);
    return () => window.removeEventListener(SAVED_REPORTS_EVENT, load);
  }, [slug]);
  const remove = (id: string) => {
    setRemoving(id);
    setError(null);
    api.staff.reports
      .remove(slug, id)
      .then(setData, failed)
      .finally(() => setRemoving(null));
  };
  const canAsk = !!assistant && !!data?.canAsk;
  return (
    <section id="kayitli" className="flex scroll-mt-6 flex-col gap-4 border-t border-line pt-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-3xl leading-tight">{t("srTitle")}</h2>
          <p className="text-sm leading-normal text-muted">{t("srHelp")}</p>
        </div>
        {canAsk && (
          <Button kind="secondary" size="sm" className="shrink-0" onClick={() => assistant.open({ text: t("srAskText") })}>
            <SparkIcon />
            {t("srAsk")}
          </Button>
        )}
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      {!data && !error && <p className="text-muted">{t("loading")}</p>}
      {data && data.reports.length === 0 && <p className="rounded-3xl bg-panel px-5 py-6 text-muted">{t("srEmpty")}</p>}
      {data && data.reports.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.reports.map((r) => (
            <li key={r.id} className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line p-5">
              {r.result ? (
                <AskedReportView t={t} lang={lang} spec={r.spec} result={r.result} compact />
              ) : (
                <div className="flex flex-col gap-1">
                  <h3 className="font-serif text-2xl leading-tight">{r.spec.title}</h3>
                  <p className="text-sm text-red">{t("srProblem")}</p>
                </div>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                {r.by && <span className="mr-auto text-xs text-muted">{fill(t("srBy"), { name: r.by })}</span>}
                {r.result && assistant && data.canAsk && (
                  <Button
                    size="sm"
                    onClick={() =>
                      assistant.open({
                        text: fill(t("xpAsk"), { what: r.spec.title, period: rangeLabel(r.result!, lang) }),
                        subject: { kind: "saved", reportId: r.id },
                      })
                    }
                  >
                    <SparkIcon />
                    {t("xpExplain")}
                  </Button>
                )}
                <Button kind="bare" size="sm" onClick={() => remove(r.id)} disabled={removing === r.id}>
                  {t("srRemove")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
