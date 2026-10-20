"use client";

import { PeniApiError, type ForecastDTO, type OrderSuggestionDTO, type StaffingDTO, type WatchDTO, type WatchPriceDTO, type WatchUnusualDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { PRICE_CHANGE_MIN_PCT, WATCH_LEARN_RAISE, WATCH_TWICE_DAYS } from "@peni/core";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { formatDay, rangeLabel } from "../amounts";
import { withCafe } from "../bugun/today";
import { axisLabel, Chart, compactTL, type ChartColors } from "../chart";
import { useSave } from "../controls";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill, type Lang, type T } from "../text";

/** Whole lira, as the rest of the panel's summaries. */
const lira = (kurus: number) => formatTL(Math.round(kurus / 100) * 100);
const UNIT = { kg: "kg", l: "L", adet: { tr: "adet", en: "pc" } } as const;
const unitWord = (u: keyof typeof UNIT, lang: Lang) => (u === "adet" ? UNIT.adet[lang] : UNIT[u]);
const qty = (milli: number, lang: Lang) => (milli / 1000).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 1 });
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
const longDay = (day: string, lang: Lang) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Gözcü (plan piece 31): prices bills changed (C12), anything out of the ordinary (C13), the
 * next 30 days of money (C14), what to order (C15) and the week's staffing (C16), each from
 * the café's own records. "Gördüm" lets a price or a finding go for everyone; a kind let go
 * again and again is shown less, and the card says so.
 */
export function Watch({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="gozcu">
      {(p) => <WatchPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function WatchPage({ cafe, t, lang, signedOut }: PanelProps) {
  const [data, setData] = useState<WatchDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useSave<WatchDTO>(lang, setData);

  useEffect(() => {
    api.staff.watch.get(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
    // Once per café.
  }, [cafe.slug]);

  const seen = (key: string) => save.run(() => api.staff.watch.dismiss(cafe.slug, { key }));
  const href = (path: string) => withCafe(path, cafe.slug);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("wTitle")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("wHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {save.error && <Notice tone="red">{save.error}</Notice>}
      {data && (
        <>
          {data.forecast && <Forecast f={data.forecast} t={t} lang={lang} href={href} />}

          <Section id="olagan" title={t("wUnusual")} help={t("wUnusualHelp")}>
            {data.unusual.length === 0 ? (
              <p className="text-muted">{t("wUnusualNone")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.unusual.map((u) => (
                  <Unusual key={u.key} u={u} t={t} lang={lang} href={href} busy={save.busy} onSeen={() => seen(u.key)} />
                ))}
              </ul>
            )}
          </Section>

          <Section id="fiyat" title={t("wPrices")} help={t("wPricesHelp")}>
            {data.prices.length === 0 ? (
              <p className="text-muted">{t("wPricesNone")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.prices.map((p) => (
                  <Price key={p.key} p={p} t={t} lang={lang} href={href} busy={save.busy} onSeen={() => seen(p.key)} />
                ))}
              </ul>
            )}
            {data.seen > 0 && <p className="text-sm text-muted">{fill(t("wSeenCount"), { n: data.seen })}</p>}
            {data.quiet > 0 && <p className="text-sm text-muted">{fill(t("wQuietCount"), { n: data.quiet })}</p>}
          </Section>

          {data.orders && <Orders orders={data.orders} t={t} lang={lang} />}
          {data.staffing && <Staffing s={data.staffing} t={t} lang={lang} href={href} />}
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

function Card({ children, tone = "line" }: { children: ReactNode; tone?: "line" | "red" }) {
  return (
    <li
      className={`flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:items-start sm:justify-between ${tone === "red" ? "border-red/40 bg-red-soft" : "border-line"}`}
    >
      {children}
    </li>
  );
}

function SeenButton({ t, busy, onSeen }: { t: T; busy: boolean; onSeen: () => void }) {
  return (
    <Button size="sm" disabled={busy} onClick={onSeen}>
      {t("wSeen")}
    </Button>
  );
}

function Unusual({ u, t, lang, href, busy, onSeen }: { u: WatchUnusualDTO; t: T; lang: Lang; href: (p: string) => string; busy: boolean; onSeen: () => void }) {
  const day = formatDay(u.day, lang);
  const amount = u.amountKurus === null ? "" : lira(Math.abs(u.amountKurus));
  const num = (n: number) => n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");
  const words =
    u.kind === "cashGap"
      ? {
          title: fill(t("wCashGap"), { amount: `${u.amountKurus! < 0 ? "−" : "+"}${amount}` }),
          detail: [fill(t("wCashGapBy"), { day, name: u.name ?? "?" }), u.note, u.limit !== null && fill(t("wCashGapLimit"), { limit: lira(u.limit) })]
            .filter(Boolean)
            .join(" · "),
        }
      : u.kind === "voids"
        ? {
            title: fill(t("wVoids"), { name: u.name ?? "?", n: u.count ?? 0 }),
            detail: fill(t("wVoidsUsual"), { usual: num(u.usual ?? 0), limit: num(u.limit ?? 0) }),
          }
        : u.kind === "billSpike"
          ? { title: fill(t("wSpike"), { name: u.name ?? "?", amount }), detail: fill(t("wSpikeUsual"), { day, usual: lira(u.usual ?? 0), limit: lira(u.limit ?? 0) }) }
          : { title: fill(t("wTwice"), { name: u.name ?? "?", amount }), detail: fill(t("wTwiceHelp"), { day }) };
  // Why it is shown less now: the owner kept letting such ones go.
  const letGo =
    u.letGo > 0 &&
    (u.kind === "billTwice" ? fill(t("wLetGoTwice"), { n: u.letGo, days: WATCH_TWICE_DAYS / WATCH_LEARN_RAISE }) : fill(t("wLetGo"), { n: u.letGo }));
  return (
    <Card tone={u.kind === "cashGap" || u.kind === "billTwice" ? "red" : "line"}>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold">{words.title}</p>
        <p className="text-sm leading-normal text-muted">{words.detail}</p>
        {letGo && <p className="text-sm leading-normal text-muted">{letGo}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <a href={href(u.href)} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold">
          {t("wLook")}
        </a>
        <SeenButton t={t} busy={busy} onSeen={onSeen} />
      </div>
    </Card>
  );
}

function Price({ p, t, lang, href, busy, onSeen }: { p: WatchPriceDTO; t: T; lang: Lang; href: (p: string) => string; busy: boolean; onSeen: () => void }) {
  const unit = unitWord(p.unit, lang);
  const pct = `${p.changePct > 0 ? "+" : "−"}%${Math.abs(p.changePct)}`;
  return (
    <Card>
      <div className="flex flex-1 flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-lg font-semibold">{p.item}</span>
          <span className={p.changePct > 0 ? "text-red" : "text-green"}>
            {fill(t("wPriceLine"), { before: formatTL(p.beforeKurus), now: formatTL(p.nowKurus), unit, pct })}
          </span>
        </p>
        <a href={href(`/panel/faturalar?fatura=${encodeURIComponent(p.billId)}`)} className="self-start text-sm text-muted underline underline-offset-4">
          {fill(t("wPriceFrom"), { supplier: p.supplier ?? "—", day: formatDay(p.date, lang) })}
        </a>
        {p.letGo > 0 && <p className="text-sm text-muted">{fill(t("wLetGoPrice"), { n: p.letGo, pct: PRICE_CHANGE_MIN_PCT * WATCH_LEARN_RAISE })}</p>}
        {p.products.length === 0 ? (
          <p className="text-sm text-muted">{t("wNoProducts")}</p>
        ) : (
          <ul className="flex flex-col">
            {p.products.map((x) => (
              <li key={x.productId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft py-2 last:border-b-0">
                <span>
                  <span className="font-semibold">{x.name}</span> <span className="text-muted tabular">{formatTL(x.priceKurus)}</span>
                </span>
                <span className="text-sm tabular">
                  {fill(t("wMargin"), { before: x.marginBeforePct, now: x.marginNowPct })}
                  {" · "}
                  {x.suggestedKurus ? (
                    <a href={href("/panel/menu")} className="font-semibold text-red underline underline-offset-4">
                      {fill(t("wSuggest"), { price: formatTL(x.suggestedKurus) })}
                    </a>
                  ) : (
                    <span className="text-muted">{t("wNoChange")}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0">
        <SeenButton t={t} busy={busy} onSeen={onSeen} />
      </div>
    </Card>
  );
}

function Forecast({ f, t, lang, href }: { f: ForecastDTO; t: T; lang: Lang; href: (p: string) => string }) {
  const option = useCallback(
    (k: ChartColors) => ({
      grid: { left: 56, right: 8, top: 12, bottom: 24 },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => (typeof v === "number" ? lira(v * 100) : "—") },
      xAxis: {
        type: "category",
        data: f.days.map((d) => formatDay(d.day, lang)),
        axisLine: { lineStyle: { color: k.line } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel(k), hideOverlap: true },
      },
      yAxis: { type: "value", splitLine: { lineStyle: { color: k.line } }, axisLabel: { ...axisLabel(k), formatter: (v: number) => compactTL(v * 100, lang) } },
      series: [
        {
          name: t("wBalance"),
          type: "line",
          data: f.days.map((d) => d.balanceKurus / 100),
          symbol: "none",
          itemStyle: { color: k.ink },
          lineStyle: { color: k.ink, width: 2 },
          areaStyle: { color: k.ink, opacity: 0.06 },
          markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: k.red, type: [4, 4] }, data: [{ yAxis: 0 }] },
        },
      ],
    }),
    [f, lang],
  );
  const short = f.shortfall;
  return (
    <section id="nakit" className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-line p-5" aria-labelledby="nakit-h">
      <div className="flex flex-col gap-1">
        <h2 id="nakit-h" className="font-serif text-3xl">
          {t("wForecast")}
        </h2>
        <p className="max-w-2xl text-sm leading-normal text-muted">{fill(t("wForecastHelp"), { day: 5 })}</p>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <dt className="text-sm text-muted">{t("wNow")}</dt>
          <dd className="font-serif text-4xl tabular">{f.startKurus === null ? "—" : lira(f.startKurus)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">
            {t("wLowest")} · {formatDay(f.lowest.day, lang)}
          </dt>
          <dd className={`font-serif text-4xl tabular ${f.lowest.balanceKurus < 0 ? "text-red" : ""}`}>{lira(f.lowest.balanceKurus)}</dd>
        </div>
      </dl>
      {short ? (
        <p className="rounded-2xl bg-red-soft px-4 py-3 font-semibold text-red" role="status">
          {fill(t("wShort"), { day: longDay(short.day, lang), amount: lira(short.balanceKurus) })}
        </p>
      ) : (
        <p className="text-green">{t("wNoShort")}</p>
      )}
      {f.startKurus === null && (
        <p className="text-sm text-muted">
          <a href={href("/panel/nakit")} className="underline underline-offset-4">
            {t("wNotTracked")}
          </a>
        </p>
      )}
      <Chart option={option} height={220} label={`${t("wForecast")}: ${t("wLowest")} ${lira(f.lowest.balanceKurus)}`} />
      <p className="text-sm text-muted">{fill(t("wUsual"), { sales: lira(f.salesPerWeekKurus), spend: lira(f.spendPerDayKurus) })}</p>
      {f.events.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold">
            {t("wPayments")} ({f.events.length})
          </summary>
          <ul className="mt-2 flex flex-col">
            {f.events.map((e, i) => (
              <li key={i} className="flex justify-between gap-4 border-b border-line-soft py-2 text-sm last:border-b-0">
                <span className="flex gap-3">
                  <span className="w-16 shrink-0 text-muted tabular">{formatDay(e.day, lang)}</span>
                  <span>{e.label}</span>
                </span>
                <span className="tabular">{lira(e.kurus)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {f.undated.length > 0 && (
        <p className="text-sm text-muted">{fill(t("wUndated"), { list: f.undated.map((u) => `${u.label} ${lira(u.kurus)}`).join(", ") })}</p>
      )}
    </section>
  );
}

function Orders({ orders, t, lang }: { orders: OrderSuggestionDTO[]; t: T; lang: Lang }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, text: string) =>
    navigator.clipboard?.writeText(text).then(
      () => setCopied(key),
      () => undefined,
    );
  const wa = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return digits.startsWith("0") ? `90${digits.slice(1)}` : digits;
  };
  return (
    <Section id="siparis" title={t("wOrders")} help={t("wOrdersHelp")}>
      {orders.length === 0 ? (
        <p className="text-muted">{t("wOrdersNone")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => {
            const key = o.supplierId ?? "none";
            return (
              <li key={key} className="flex flex-col gap-3 rounded-3xl border border-line p-5">
                <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-lg font-semibold">{o.name}</span>
                  {o.phone && <span className="text-sm text-muted tabular">{o.phone}</span>}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted">
                      <tr>
                        <th className="py-1 font-normal"> </th>
                        <th className="py-1 text-right font-normal">{t("wHave")}</th>
                        <th className="hidden py-1 text-right font-normal sm:table-cell">{t("wPerDay")}</th>
                        <th className="py-1 text-right font-normal">{t("wLasts")}</th>
                        <th className="py-1 text-right font-normal">{t("wOrder")}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {o.lines.map((l) => (
                        <tr key={l.itemId} className="border-t border-line-soft">
                          <td className="py-2 pr-2 font-semibold">{l.name}</td>
                          <td className={`py-2 text-right ${l.qtyMilli <= 0 ? "text-red" : ""}`}>
                            {qty(l.qtyMilli, lang)} {unitWord(l.unit, lang)}
                          </td>
                          <td className="hidden py-2 text-right sm:table-cell">{qty(l.usedPerDayMilli, lang)}</td>
                          <td className="py-2 text-right">{fill(t("wDays"), { n: l.daysLeft.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB") })}</td>
                          <td className="py-2 text-right font-semibold">
                            {qty(l.orderMilli, lang)} {unitWord(l.unit, lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {o.lines
                  .filter((l) => l.habit)
                  .map((l) => (
                    <p key={l.itemId} className="text-sm leading-normal text-muted">
                      {fill(t("wHabit"), {
                        name: l.name,
                        rule: `${qty(l.ruleMilli, lang)} ${unitWord(l.unit, lang)}`,
                        times: l.habit!.times,
                        x: (l.habit!.pct / 100).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: 1 }),
                        order: `${qty(l.orderMilli, lang)} ${unitWord(l.unit, lang)}`,
                      })}
                    </p>
                  ))}
                <p className="rounded-2xl bg-panel px-4 py-3 text-sm leading-normal">{o.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => copy(key, o.message)}>
                    {copied === key ? t("wCopied") : t("wCopy")}
                  </Button>
                  {o.phone && (
                    <a
                      href={`https://wa.me/${wa(o.phone)}?text=${encodeURIComponent(o.message)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold"
                    >
                      {t("wWhatsapp")}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function Staffing({ s, t, lang, href }: { s: StaffingDTO; t: T; lang: Lang; href: (p: string) => string }) {
  const week = rangeLabel({ from: s.week, through: new Date(Date.parse(`${s.week}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10) }, lang);
  const num = (n: number) => n.toLocaleString(lang === "tr" ? "tr-TR" : "en-GB");
  const note = !s.fromHistory ? ` ${t("wStaffingDefault")}` : !s.barsFromHistory ? ` ${t("wStaffingBarsDefault")}` : "";
  return (
    <Section
      id="vardiya"
      title={t("wStaffing")}
      help={`${fill(t("wStaffingHelp"), { week, load: num(s.usualLoad), busy: num(s.busyAt), quiet: num(s.quietAt) })}${note}`}
    >
      {s.hints.length === 0 ? (
        <p className="text-muted">{t("wStaffingNone")}</p>
      ) : (
        <ul className="flex flex-col">
          {s.hints.map((h) => (
            <li
              key={`${h.day}:${h.fromHour}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft py-3 last:border-b-0"
            >
              <span>
                <span className="font-semibold capitalize">{longDay(h.day, lang)}</span>{" "}
                <span className="tabular">
                  {hour(h.fromHour)}–{hour(h.toHour)}
                </span>
              </span>
              <span className={`text-sm ${h.kind === "quiet" ? "text-muted" : "text-red"}`}>
                {fill(t(h.kind === "busy" ? "wBusy" : h.kind === "nobody" ? "wNobody" : "wQuiet"), { people: h.people, orders: h.orders })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <a href={href(`/panel/vardiyalar?hafta=${s.week}`)} className="self-start text-sm font-semibold underline underline-offset-4">
        {t("wOpenShifts")}
      </a>
    </Section>
  );
}
