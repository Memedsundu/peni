"use client";

import { PeniApiError, type AlertDTO, type TodayDTO, type TodaySalesDTO } from "@peni/api";
import { alertWords } from "@peni/api/alert-text";
import { formatTL } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { rangeLabel } from "../amounts";
import { axisLabel, change, Chart, compactTL, signedPercent, type ChartColors } from "../chart";
import { useSave } from "../controls";
import { has, PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

/** "16 Ekim Cuma". */
function longDay(day: string, lang: Lang): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** A panel path with the café on it. */
export function withCafe(href: string, slug: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}kafe=${encodeURIComponent(slug)}`;
}

/**
 * Bugün (plan piece 22): what needs doing, worked out from the café's own numbers, one card
 * per kind with the one thing to do about it; then how far today's task lists are. In
 * Shelby these were a separate Uyarılar page; here they are the first thing you see.
 */
export function Today({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="bugun">
      {(p) => <TodayPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function TodayPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<TodayDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useSave<TodayDTO>(lang, setData);

  useEffect(() => {
    api.staff.today.get(cafe.slug).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: unknown) => {
        if (e instanceof PeniApiError && e.status === 401) signedOut();
        else setError(errorText(e, lang));
      },
    );
  }, [cafe.slug]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("todayTitle")}</h1>
        {data && <p className="text-muted capitalize">{longDay(data.today, lang)}</p>}
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          {data.sales && <SalesToday sales={data.sales} slug={cafe.slug} t={t} lang={lang} />}
          {data.letter && (
            <a
              href={withCafe(`/panel/mektup?hafta=${data.letter.weekStart}`, cafe.slug)}
              className="flex flex-col gap-2 rounded-3xl bg-green-soft p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-col gap-1">
                <span className="text-sm text-green">
                  {fill(t("ltCard"), { week: rangeLabel({ from: data.letter.weekStart, through: data.letter.weekEnd }, lang) })}
                </span>
                <span className="font-serif text-2xl leading-tight">{data.letter.headline}</span>
              </span>
              <span className="shrink-0 font-semibold underline underline-offset-4">{t("ltRead")}</span>
            </a>
          )}
          <section className="flex flex-col gap-3" aria-labelledby="attention">
            <h2 id="attention" className="text-sm text-muted">
              {t("todayAttention")}
            </h2>
            {data.alerts.length === 0 ? (
              <p className="rounded-3xl bg-panel px-5 py-6 leading-normal">{data.email.eligible ? t("todayAllGood") : t("todayAllGoodBarista")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.alerts.map((a) => (
                  <AlertCard key={`${a.type}:${a.month ?? ""}`} alert={a} today={data.today} slug={cafe.slug} t={t} lang={lang} />
                ))}
              </ul>
            )}
          </section>

          {data.tasks && (
            <section className="flex flex-col gap-3" aria-labelledby="tasks">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="tasks" className="text-sm text-muted">
                  {t("todayTasks")}
                </h2>
                {data.tasks.total > 0 && (
                  <span className="text-sm font-semibold tabular">{fill(t("progress"), { done: data.tasks.done, total: data.tasks.total })}</span>
                )}
              </div>
              {data.tasks.lists.length === 0 ? (
                <p className="text-muted">{t("todayNoTasks")}</p>
              ) : (
                <ul className="flex flex-col">
                  {data.tasks.lists.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-4 border-b border-line-soft py-3 last:border-b-0">
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{l.name}</span>
                        {l.mine && <span className="rounded-full bg-green-soft px-2.5 py-0.5 text-xs font-semibold text-green">{t("yours")}</span>}
                      </span>
                      <Progress done={l.done} total={l.total} />
                    </li>
                  ))}
                </ul>
              )}
              {has(cafe, "tasks.view") && (
                <a
                  href={withCafe("/panel/gorevler", cafe.slug)}
                  className="inline-flex min-h-12 items-center self-start rounded-full border border-line px-5 font-semibold"
                >
                  {t("openTasks")}
                </a>
              )}
            </section>
          )}

          {data.email.eligible && (
            <section className="flex flex-col gap-3 rounded-3xl bg-panel p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold">
                  {t("morningEmail")} · <span className={data.email.on ? "text-green" : "text-muted"}>{data.email.on ? t("emailOn") : t("emailOff")}</span>
                </h2>
                <p className="text-sm leading-normal text-muted">{t("morningEmailHelp")}</p>
              </div>
              <Button kind="quiet" size="sm" disabled={save.busy} onClick={() => save.run(() => api.staff.today.email(cafe.slug, { on: !data.email.on }))}>
                {data.email.on ? t("turnOff") : t("turnOn")}
              </Button>
              {save.error && <Notice tone="red">{save.error}</Notice>}
            </section>
          )}
        </>
      )}
    </>
  );
}

function AlertCard({ alert: a, today, slug, t, lang }: { alert: AlertDTO; today: string; slug: string; t: T; lang: Lang }) {
  const words = alertWords(a, lang, formatTL, today);
  const critical = a.level === "critical";
  return (
    <li
      className={`flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:items-center sm:justify-between ${critical ? "border-red/30 bg-red-soft" : "border-line bg-paper"}`}
    >
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          {critical && <span className="rounded-full bg-red px-2.5 py-0.5 text-xs font-semibold text-paper">{t("urgent")}</span>}
          <span className="text-lg font-semibold">{words.title}</span>
        </p>
        {words.detail && <p className="text-sm leading-normal text-muted">{words.detail}</p>}
      </div>
      <a
        href={withCafe(a.href, slug)}
        className={`inline-flex min-h-11 shrink-0 items-center self-start rounded-full px-4 text-sm font-semibold sm:self-auto ${critical ? "bg-ink text-paper" : "border border-line bg-paper"}`}
      >
        {words.action}
      </a>
    </li>
  );
}

/** "3/4" with a thin bar. */
export function Progress({ done, total }: { done: number; total: number }) {
  const all = total > 0 && done >= total;
  return (
    <span className="flex items-center gap-3">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-tile" aria-hidden="true">
        <span className={`block h-full rounded-full ${all ? "bg-green" : "bg-ink"}`} style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </span>
      <span className={`min-w-10 text-right text-sm font-semibold tabular ${all ? "text-green" : ""}`}>
        {done}/{total}
      </span>
    </span>
  );
}

/** Today's sales so far, hour by hour, against the same weekday last week (plan piece 23). */
function SalesToday({ sales, slug, t, lang }: { sales: TodaySalesDTO; slug: string; t: T; lang: Lang }) {
  const c = change(sales.salesKurus, sales.lastWeekKurus);
  const weekday = new Date(`${sales.lastWeekDay}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", timeZone: "UTC" });
  const option = useCallback(
    (k: ChartColors) => ({
      grid: { left: 48, right: 8, top: 12, bottom: 24 },
      tooltip: { valueFormatter: (v: unknown) => (typeof v === "number" ? formatTL(v * 100) : "—") },
      xAxis: {
        type: "category",
        data: sales.hours.map((h) => `${h.hour}:00`),
        axisLine: { lineStyle: { color: k.line } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel(k), hideOverlap: true },
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: k.line } }, axisLabel: { ...axisLabel(k), formatter: (v: number) => compactTL(v * 100, lang) } },
      series: [
        {
          name: t("todayTitle"),
          type: "bar",
          data: sales.hours.map((h) => h.salesKurus / 100),
          barMaxWidth: 22,
          itemStyle: { color: k.ink, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: weekday,
          type: "line",
          data: sales.hours.map((h) => h.lastWeekKurus / 100),
          symbol: "none",
          itemStyle: { color: k.mark },
          lineStyle: { color: k.mark, width: 2, type: [4, 4] },
        },
      ],
    }),
    [sales, lang],
  );
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-line p-5" aria-labelledby="sales-today">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sales-today" className="text-sm text-muted">
          {t("todaySales")}
        </h2>
        <a href={withCafe("/panel/raporlar", slug)} className="text-sm font-semibold underline underline-offset-4">
          {t("openReports")}
        </a>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-serif text-4xl leading-tight tabular">{lira(sales.salesKurus)}</span>
        <span className="text-muted">{fill(t("rpOrdersN"), { n: sales.orders })}</span>
        {c !== null && <span className={`font-semibold tabular ${c >= 0 ? "text-green" : "text-red"}`}>{signedPercent(c, lang)}</span>}
      </p>
      <p className="text-sm text-muted">
        {sales.salesKurus === 0 && sales.orders === 0 ? `${t("todaySalesNone")} ` : ""}
        {fill(t("todaySalesVs"), { day: weekday, v: lira(sales.lastWeekKurus) })}
      </p>
      {sales.hours.length > 0 && <Chart option={option} height={170} label={`${t("todaySales")}: ${lira(sales.salesKurus)}`} />}
    </section>
  );
}

const lira = (kurus: number) => formatTL(Math.round(kurus / 100) * 100);
