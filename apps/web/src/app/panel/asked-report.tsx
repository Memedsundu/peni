"use client";

import type { AskedReportDTO, AskedResultDTO, BillCategoryDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useCallback, useMemo } from "react";
import { formatDay, rangeLabel } from "./amounts";
import { axisLabel, change, Chart, compactTL, signedPercent, type ChartColors } from "./chart";
import { CATEGORY } from "./faturalar/bills";
import { fill, type Lang, type T, type TextKey } from "./text";

/** Report figures in whole lira, as on Raporlar. */
const lira = (kurus: number) => formatTL(Math.round(kurus / 100) * 100);

/** One row's name: a product or supplier as it is, the rest from its key. */
export function rowLabel(spec: AskedReportDTO, row: { key: string; label: string | null }, t: T, lang: Lang): string {
  const { by } = spec;
  const k = row.key;
  if (by === "hour") return `${k}:00`;
  if (by === "weekday") return t(`wd_${k}` as TextKey);
  if (by === "day") return formatDay(k, lang);
  if (by === "week") return formatDay(k, lang);
  if (by === "month")
    return new Date(`${k}-15T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
  if (by === "payment") return t(`pay_${k}` as TextKey);
  if (by === "expenseKind") return k in CATEGORY ? t(CATEGORY[k as BillCategoryDTO]) : k;
  if (k === "_none") return t(by === "supplier" ? "arNoSupplier" : "arNoCategory");
  return row.label ?? k;
}

/**
 * A report asked for in words (plan piece 29, B9): its total against the period compared,
 * and a chart or a table of its rows. The same view shows it in the chat and on Raporlar.
 */
export function AskedReportView({
  t,
  lang,
  spec,
  result,
  compact = false,
}: {
  t: T;
  lang: Lang;
  spec: AskedReportDTO;
  result: AskedResultDTO;
  compact?: boolean;
}) {
  const r = result;
  const money = r.unit === "kurus";
  const locale = lang === "tr" ? "tr-TR" : "en-GB";
  const value = (n: number) => (money ? lira(n) : n.toLocaleString(locale));
  const compared = r.compareFrom && r.compareThrough ? { from: r.compareFrom, through: r.compareThrough } : null;
  const c = r.previousTotal === null ? null : change(r.total, r.previousTotal);
  // The same rows while the chat around it re-renders, so the chart isn't drawn again.
  const rows = useMemo(() => {
    const all = r.rows.map((row) => ({ ...row, name: rowLabel(spec, row, t, lang) }));
    if (r.rest) all.push({ key: "_rest", label: null, value: r.rest.value, previous: r.rest.previous, name: fill(t("arRest"), { n: r.rest.rows }) });
    return all;
  }, [r, spec, lang]);
  const table = spec.chart === "table" || spec.by === "none" || rows.length === 0;

  const grid = (
    <table className="mt-2 w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-line text-muted">
          <th className="py-2 pr-3 font-normal" />
          <th className="py-2 pr-3 text-right font-normal">{rangeLabel(r, lang)}</th>
          {compared && <th className="py-2 text-right font-normal">{rangeLabel(compared, lang)}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-b border-line-soft">
            <td className="py-2 pr-3">{row.name}</td>
            <td className="py-2 pr-3 text-right font-semibold tabular">{value(row.value)}</td>
            {compared && <td className="py-2 text-right tabular text-muted">{row.previous === null ? "—" : value(row.previous)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className={`font-serif leading-tight ${compact ? "text-2xl" : "text-3xl"}`}>{spec.title}</h3>
        <p className="text-sm text-muted">
          {rangeLabel(r, lang)}
          {compared && ` · ${fill(t("arVs"), { prev: rangeLabel(compared, lang) })}`}
        </p>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="text-sm text-muted">{t("arTotal")}</span>
        <span className="font-serif text-3xl tabular">{value(r.total)}</span>
        {c !== null && <span className="text-sm font-semibold tabular text-muted">{signedPercent(c, lang)}</span>}
        {r.previousTotal !== null && <span className="text-sm text-muted">{fill(t("rpBefore"), { v: value(r.previousTotal) })}</span>}
      </p>
      {!table && <RowsChart t={t} lang={lang} spec={spec} rows={rows} money={money} compared={!!compared} height={compact ? 200 : 240} />}
      {rows.length > 0 && table && grid}
      {rows.length > 0 && !table && !compact && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-muted">{t("arTable")}</summary>
          {grid}
        </details>
      )}
      {(r.notes.length > 0 || r.matched.length > 0) && (
        <ul className="flex flex-col gap-1 text-xs leading-normal text-muted">
          {r.matched.length > 0 && <li>{fill(t("arMatched"), { names: r.matched.join(", ") })}</li>}
          {r.notes.includes("noMatch") && <li className="text-red">{t("arNotesNoMatch")}</li>}
          {r.notes.includes("orders") && <li>{t("arNotesOrders")}</li>}
          {r.notes.includes("noCost") && <li>{fill(t("arNotesNoCost"), { n: r.noCost })}</li>}
        </ul>
      )}
    </div>
  );
}

function RowsChart({
  t,
  lang,
  spec,
  rows,
  money,
  compared,
  height,
}: {
  t: T;
  lang: Lang;
  spec: AskedReportDTO;
  rows: { key: string; name: string; value: number; previous: number | null }[];
  money: boolean;
  compared: boolean;
  height: number;
}) {
  const scale = (n: number | null) => (n === null ? null : money ? n / 100 : n);
  const option = useCallback(
    (c: ChartColors) => ({
      grid: { left: money ? 56 : 40, right: 8, top: compared ? 36 : 12, bottom: 28 },
      tooltip: { valueFormatter: (v: unknown) => (typeof v !== "number" ? "—" : money ? lira(v * 100) : v.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB")) },
      legend: compared ? { right: 0, top: 0, textStyle: axisLabel(c), itemWidth: 12, itemHeight: 8, data: [t("rpThisPeriod"), t("arBefore")] } : undefined,
      xAxis: {
        type: "category",
        data: rows.map((r) => r.name),
        axisLine: { lineStyle: { color: c.line } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel(c), hideOverlap: true },
      },
      yAxis: {
        type: "value",
        minInterval: money ? undefined : 1,
        splitLine: { lineStyle: { color: c.line } },
        axisLabel: { ...axisLabel(c), formatter: (v: number) => (money ? compactTL(v * 100, lang) : String(v)) },
      },
      series: [
        spec.chart === "line"
          ? {
              name: t("rpThisPeriod"),
              type: "line",
              data: rows.map((r) => scale(r.value)),
              symbol: "circle",
              symbolSize: 6,
              itemStyle: { color: c.ink },
              lineStyle: { color: c.ink, width: 2 },
            }
          : {
              name: t("rpThisPeriod"),
              type: "bar",
              data: rows.map((r) => scale(r.value)),
              barMaxWidth: 28,
              itemStyle: { color: c.ink, borderRadius: [3, 3, 0, 0] },
            },
        ...(compared
          ? [
              {
                name: t("arBefore"),
                type: "line",
                data: rows.map((r) => scale(r.previous)),
                symbol: "none",
                itemStyle: { color: c.mark },
                lineStyle: { color: c.mark, width: 2, type: [4, 4] },
              },
            ]
          : []),
      ],
    }),
    [rows, lang, compared, money, spec.chart, spec.title],
  );
  return <Chart option={option} height={height} label={`${spec.title}: ${rows.map((r) => `${r.name} ${money ? lira(r.value) : r.value}`).join(", ")}`} />;
}
