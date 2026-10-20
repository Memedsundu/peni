"use client";

import { PeniApiError, type InsightEffectDTO, type InsightEventDTO, type InsightRateDTO, type InsightsDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../kasa/api";
import { Notice } from "../../kasa/ui";
import { formatDay, formatMonth, shiftMonth } from "../amounts";
import { axisLabel, Chart, signedPercent, type ChartColors } from "../chart";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T, type TextKey } from "../text";

const lira = (kurus: number) => formatTL(Math.round(kurus / 100) * 100);
const MONTHS = 24;

/**
 * Müdavimler (plan piece 32): who came this month and who came back, what brings people back
 * (peni, treats, the askı, events) and how each event went. Counts only, from members who
 * use Peni; nobody is named, and a share for fewer than three people isn't shown.
 */
export function Regulars({ cafeSlug, month }: { cafeSlug: string | null; month: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="mudavimler">
      {(p) => <RegularsPage key={p.cafe.slug} {...p} initialMonth={month} />}
    </PanelShell>
  );
}

function RegularsPage({ cafe, t, lang, signedOut, initialMonth }: PanelProps & { initialMonth: string | null }) {
  const [month, setMonth] = useState<string | null>(initialMonth);
  const [data, setData] = useState<InsightsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api.staff.insights(cafe.slug, month ?? undefined).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
  }, [cafe.slug, month]);

  const latest = data?.thisMonth ?? month ?? new Date().toISOString().slice(0, 7);
  const months = Array.from({ length: MONTHS }, (_, i) => shiftMonth(latest, -i));
  const pick = (m: string) => {
    setMonth(m);
    const url = new URL(window.location.href);
    url.searchParams.set("ay", m);
    window.history.replaceState(null, "", url);
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("navRegulars")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("ciHelp")}</p>
      </section>
      <label className="flex flex-col gap-1 text-sm text-muted sm:w-72">
        {t("ciMonth")}
        <select
          value={data?.month ?? month ?? latest}
          onChange={(e) => pick(e.target.value)}
          className="min-h-12 rounded-2xl border border-line bg-paper px-4 text-base text-ink capitalize"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonth(m, lang)}
            </option>
          ))}
        </select>
      </label>
      {error && <Notice tone="red">{error}</Notice>}
      {data && (
        <>
          <Headline d={data} t={t} lang={lang} />
          <Weeks d={data} t={t} lang={lang} />
          <Section
            id="geri"
            title={t("ciEffects")}
            help={fill(t("ciEffectsHelp"), { from: formatDay(data.effectFrom, lang), through: formatDay(data.effectThrough, lang) })}
          >
            <ul className="flex flex-col divide-y divide-line-soft rounded-3xl border border-line px-5">
              {data.effects.map((e) => (
                <Effect key={e.kind} e={e} t={t} />
              ))}
            </ul>
          </Section>
          <Section id="aski" title={t("ciAskida")} help={t("ciAskidaPrivate")}>
            <p className="leading-normal">
              {fill(t("ciAskidaLine"), { given: data.askida.given, amount: lira(data.askida.donatedKurus), donors: data.askida.donors })}
            </p>
          </Section>
          <Section id="etkinlik" title={t("ciEvents")} help={t("ciEventsHelp")}>
            {data.events.length === 0 ? (
              <p className="text-muted">{t("ciEventsNone")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.events.map((e) => (
                  <Event key={e.id} e={e} t={t} lang={lang} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}

function Section({ id, title, help, children }: { id: string; title: string; help: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-4" aria-labelledby={`${id}-h`}>
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-h`} className="font-serif text-3xl">
          {title}
        </h2>
        <p className="max-w-2xl text-sm leading-normal text-muted">{help}</p>
      </div>
      {children}
    </section>
  );
}

function Headline({ d, t, lang }: { d: InsightsDTO; t: T; lang: Lang }) {
  const soFar = d.through < `${d.month}-${String(new Date(Date.UTC(Number(d.month.slice(0, 4)), Number(d.month.slice(5)), 0)).getUTCDate())}`;
  const stat = (label: string, n: number, before: number, help?: string) => (
    <div className="flex flex-col gap-1 rounded-3xl border border-line p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="font-serif text-4xl leading-none tabular">{n}</p>
      <p className="text-sm text-muted">{fill(t("ciBefore"), { n: before })}</p>
      {help && <p className="text-xs text-muted">{help}</p>}
    </div>
  );
  return (
    <section className="flex flex-col gap-4" aria-label={t("navRegulars")}>
      <p className="text-sm text-muted">
        <span className="capitalize">{formatMonth(d.month, lang)}</span>
        {soFar && ` · ${fill(t("ciSoFar"), { day: formatDay(d.through, lang) })}`} · {fill(t("ciMembers"), { n: d.members, joined: d.joined })}
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {stat(t("ciVisitors"), d.visitors, d.visitorsBefore)}
        {stat(t("ciNewcomers"), d.newcomers, d.newcomersBefore)}
        {stat(t("ciRegulars"), d.regulars, d.regularsBefore, t("ciRegularsHelp"))}
      </div>
      <div className="flex flex-col gap-2 rounded-3xl bg-panel p-5">
        {d.cameBack.people === 0 ? (
          <p>{t("ciCameBackNone")}</p>
        ) : (
          <>
            <p className="text-lg font-semibold">{fill(t("ciCameBack"), { people: d.cameBack.people, back: d.cameBack.cameBack })}</p>
            {d.cameBack.pct !== null && <Bar pct={d.cameBack.pct} />}
          </>
        )}
        {d.regularsAway > 0 && <p className="text-sm text-muted">{fill(t("ciAway"), { n: d.regularsAway })}</p>}
      </div>
    </section>
  );
}

function Bar({ pct, muted = false }: { pct: number; muted?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line-soft" aria-hidden>
      <div className={`h-full rounded-full ${muted ? "bg-muted" : "bg-ink"}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

function Weeks({ d, t, lang }: { d: InsightsDTO; t: T; lang: Lang }) {
  const option = useCallback(
    (k: ChartColors) => ({
      grid: { left: 32, right: 8, top: 36, bottom: 24 },
      legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 12, textStyle: { ...axisLabel(k), color: k.muted } },
      xAxis: {
        type: "category",
        data: d.weeks.map((w) => formatDay(w.week, lang)),
        axisLine: { lineStyle: { color: k.line } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel(k), hideOverlap: true },
      },
      yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: k.line } }, axisLabel: axisLabel(k) },
      series: [
        { name: t("ciReturning"), type: "bar", stack: "p", data: d.weeks.map((w) => w.returning), itemStyle: { color: k.ink }, barMaxWidth: 28 },
        {
          name: t("ciFirstTime"),
          type: "bar",
          stack: "p",
          data: d.weeks.map((w) => w.newcomers),
          itemStyle: { color: k.accent, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 28,
        },
      ],
    }),
    [d, lang],
  );
  const total = d.weeks.reduce((s, w) => s + w.newcomers + w.returning, 0);
  return (
    <Section id="hafta" title={t("ciWeeks")} help={t("ciWeeksHelp")}>
      <Chart option={option} height={220} label={`${t("ciWeeks")}: ${total}`} />
    </Section>
  );
}

function Effect({ e, t }: { e: InsightEffectDTO; t: T }) {
  const side = (label: string, r: InsightRateDTO, muted: boolean) => (
    <div className="flex flex-col gap-1">
      <p className="flex justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="tabular">{r.pct === null ? fill(t("ciTooFew"), { people: r.people }) : fill(t("ciRate"), { people: r.people, pct: r.pct })}</span>
      </p>
      {r.pct !== null && <Bar pct={r.pct} muted={muted} />}
    </div>
  );
  return (
    <li className="grid gap-3 py-4 sm:grid-cols-[12rem_1fr] sm:items-center">
      <p className="font-semibold">{t(`ciEffect_${e.kind}` as TextKey)}</p>
      <div className="flex flex-col gap-2">
        {side(t("ciDid"), e.with, false)}
        {side(t("ciDidNot"), e.without, true)}
      </div>
    </li>
  );
}

function Event({ e, t, lang }: { e: InsightEventDTO; t: T; lang: Lang }) {
  const n = (label: string, v: number) => (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-serif text-2xl tabular">{v}</span>
    </div>
  );
  return (
    <li className="flex flex-col gap-3 rounded-3xl border border-line p-5">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{e.title}</p>
        <p className="text-sm text-muted">
          {formatDay(e.day, lang)} · {e.byMember ? t("ciByMember") : t("ciByCafe")}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {n(t("ciGoing"), e.going)}
        {n(t("ciCame"), e.came)}
        {n(t("ciCameAgain"), e.cameBackAfter)}
        {n(t("ciNewThatDay"), e.newcomers)}
      </div>
      <p className="text-sm text-muted">
        {fill(t("ciOrders"), { n: e.orders })}
        {e.usualOrders !== null &&
          `, ${fill(t("ciOrdersUsual"), {
            usual: e.usualOrders.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB"),
            pct: e.liftPct === null ? "—" : signedPercent(e.liftPct, lang),
          })}`}
      </p>
    </li>
  );
}
