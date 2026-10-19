"use client";

import { PeniApiError, type ExpenseKindDTO, type ReportProductDTO, type SalesReportDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { addDaysTo, formatDay, formatMonth, shiftMonth } from "../amounts";
import { axisLabel, change, Chart, compactTL, signedPercent, type ChartColors } from "../chart";
import { Segmented } from "../controls";
import { CATEGORY } from "../faturalar/bills";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";
import { withCafe } from "../bugun/today";

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "90" | "year" | "custom";
type Range = { from: string; through: string };
type Sort = "profit" | "qty" | "sales";

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

/** "1–18 Eki", "18 Eki", "1 Eyl – 15 Eki". */
function rangeLabel(r: Range, lang: Lang): string {
  if (r.from === r.through) return formatDay(r.from, lang, { year: r.from.slice(0, 4) !== new Date().toISOString().slice(0, 4) });
  if (r.from.slice(0, 7) === r.through.slice(0, 7)) return `${Number(r.from.slice(8))}–${formatDay(r.through, lang)}`;
  return `${formatDay(r.from, lang)} – ${formatDay(r.through, lang)}`;
}

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
    <div className={`flex flex-col gap-10 transition-opacity ${busy ? "opacity-60" : ""}`} aria-busy={busy}>
      <Headline data={data} t={t} lang={lang} />
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
  );
}

function Heading({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="font-serif text-3xl leading-tight">{title}</h2>
      {help && <p className="text-sm leading-normal text-muted">{help}</p>}
    </div>
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

/** "08:00", "16 Eki", "12 Eki haftası", "Eylül". */
function pointLabel(key: string, step: SalesReportDTO["series"]["step"], lang: Lang): string {
  if (step === "hour") return `${key}:00`;
  if (step === "day") return formatDay(key, lang);
  if (step === "week") return formatDay(key, lang);
  return new Date(`${key}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "short", timeZone: "UTC" });
}

function SalesChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const { step, points } = data.series;
  const option = useCallback(
    (c: ChartColors) => ({
      grid: { left: 56, right: 8, top: 36, bottom: 28 },
      tooltip: { valueFormatter: (v: unknown) => (typeof v === "number" ? lira(v * 100) : "—") },
      legend: { right: 0, top: 0, textStyle: axisLabel(c), itemWidth: 12, itemHeight: 8, data: [t("rpThisPeriod"), t("rpPrevPeriod")] },
      xAxis: {
        type: "category",
        data: points.map((p) => pointLabel(p.key, step, lang)),
        axisLine: { lineStyle: { color: c.line } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel(c), hideOverlap: true },
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: c.line } }, axisLabel: { ...axisLabel(c), formatter: (v: number) => compactTL(v * 100, lang) } },
      series: [
        {
          name: t("rpThisPeriod"),
          type: "bar",
          data: points.map((p) => p.salesKurus / 100),
          barMaxWidth: 28,
          itemStyle: { color: c.ink, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: t("rpPrevPeriod"),
          type: "line",
          data: points.map((p) => (p.previousKurus === null ? null : p.previousKurus / 100)),
          symbol: "none",
          itemStyle: { color: c.mark },
          lineStyle: { color: c.mark, width: 2, type: [4, 4] },
        },
      ],
    }),
    [data, lang],
  );
  const total = points.reduce((s, p) => s + p.salesKurus, 0);
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpSalesChart")} />
      {total === 0 && points.every((p) => !p.previousKurus) ? (
        <p className="rounded-3xl bg-panel px-5 py-6">{t("rpNoSales")}</p>
      ) : (
        <Chart option={option} height={280} label={`${t("rpSalesChart")}: ${lira(total)}`} />
      )}
    </section>
  );
}

function HoursChart({ data, t }: { data: SalesReportDTO; t: T }) {
  const busiest = data.hours.reduce((a, b) => (b.orders > a.orders ? b : a), data.hours[0]!);
  const option = useCallback(
    (c: ChartColors) => ({
      grid: { left: 40, right: 8, top: 12, bottom: 28 },
      xAxis: {
        type: "category",
        data: data.hours.map((h) => h.hour),
        axisLine: { lineStyle: { color: c.line } },
        axisTick: { show: false },
        axisLabel: axisLabel(c),
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: c.line } }, axisLabel: axisLabel(c), minInterval: 1 },
      series: [
        {
          name: t("rpOrders"),
          type: "bar",
          data: data.hours.map((h) => ({ value: h.orders, itemStyle: { color: h.hour === busiest.hour ? c.green : c.ink } })),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [data],
  );
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpByHour")} help={t("rpByHourHelp")} />
      <Chart option={option} height={220} label={`${t("rpByHour")}: ${busiest.hour}:00`} />
    </section>
  );
}

function WeekdayChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const best = data.weekdays.reduce((a, b) => (b.avgKurus > a.avgKurus ? b : a), data.weekdays[0]!);
  const option = useCallback(
    (c: ChartColors) => ({
      grid: { left: 56, right: 8, top: 12, bottom: 28 },
      tooltip: { valueFormatter: (v: unknown) => (typeof v === "number" ? lira(v * 100) : "—") },
      xAxis: {
        type: "category",
        data: data.weekdays.map((w) => t(`wd_${w.weekday}` as TextKey)),
        axisLine: { lineStyle: { color: c.line } },
        axisTick: { show: false },
        axisLabel: axisLabel(c),
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: c.line } }, axisLabel: { ...axisLabel(c), formatter: (v: number) => compactTL(v * 100, lang) } },
      series: [
        {
          name: t("rpSales"),
          type: "bar",
          data: data.weekdays.map((w) => ({ value: w.avgKurus / 100, itemStyle: { color: w.weekday === best.weekday ? c.green : c.ink } })),
          barMaxWidth: 28,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
        },
      ],
    }),
    [data, lang],
  );
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpByWeekday")} help={t("rpByWeekdayHelp")} />
      <Chart option={option} height={220} label={`${t("rpByWeekday")}: ${t(`wd_${best.weekday}` as TextKey)}`} />
    </section>
  );
}

function MonthsChart({ data, t, lang }: { data: SalesReportDTO; t: T; lang: Lang }) {
  const thisMonth = data.today.slice(0, 7);
  const label = (m: string) => {
    const name = new Date(`${m}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "short", timeZone: "UTC" });
    return m === thisMonth ? fill(t("rpThisMonthSoFar"), { m: name }) : name;
  };
  const option = useCallback(
    (c: ChartColors) => ({
      grid: { left: 56, right: 8, top: 36, bottom: 28 },
      tooltip: { valueFormatter: (v: unknown) => (typeof v === "number" ? lira(v * 100) : "—") },
      legend: { right: 0, top: 0, textStyle: axisLabel(c), itemWidth: 12, itemHeight: 8 },
      xAxis: {
        type: "category",
        data: data.months.map((m) => label(m.month)),
        axisLine: { lineStyle: { color: c.line } },
        axisTick: { show: false },
        axisLabel: axisLabel(c),
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: c.line } }, axisLabel: { ...axisLabel(c), formatter: (v: number) => compactTL(v * 100, lang) } },
      series: [
        {
          name: t("rpSales"),
          type: "bar",
          data: data.months.map((m) => m.salesKurus / 100),
          barMaxWidth: 28,
          itemStyle: { color: c.ink, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: t("rpExpenses"),
          type: "bar",
          data: data.months.map((m) => m.expensesKurus / 100),
          barMaxWidth: 28,
          itemStyle: { color: c.mark, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: t("rpLeftOver"),
          type: "line",
          data: data.months.map((m) => m.profitKurus / 100),
          symbol: "circle",
          symbolSize: 7,
          itemStyle: { color: c.green },
          lineStyle: { color: c.green, width: 2 },
        },
      ],
    }),
    [data, lang],
  );
  return (
    <section className="flex flex-col gap-3">
      <Heading title={t("rpMonths")} help={t("rpMonthsHelp")} />
      <Chart option={option} height={260} label={data.months.map((m) => `${formatMonth(m.month, lang)}: ${lira(m.profitKurus)}`).join(", ")} />
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
      <Heading title={t("rpSpendTitle")} help={`${t("rpExpensesHelp")} ${tl(data.totals.expensesKurus)}`} />
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
      <Heading title={t("rpPaidWith")} help={t("rpPaidWithHelp")} />
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
      <Heading title={t("rpProducts")} help={t("rpProductsHelp")} />
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
