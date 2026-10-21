"use client";

import { type CafePlanKey } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { PLANS } from "@peni/core";
import { PanelShell, trialDaysLeft, type PanelProps } from "../shell";
import { fill, type TextKey } from "../text";

const ORDER: readonly CafePlanKey[] = ["topluluk", "penny", "isletme"];
const HAS: Record<CafePlanKey, TextKey> = { topluluk: "planToplulukHas", penny: "planPennyHas", isletme: "planIsletmeHas" };

/**
 * Plan (N11): what the café has now, how long the trial has left, and the three plans side by
 * side. There's no online payment yet, so moving up is an email to the Penny team.
 */
export function Plans({ cafeSlug, contactEmail }: { cafeSlug: string | null; contactEmail: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="plan" wide>
      {(p) => <PlansPage key={p.cafe.slug} {...p} contactEmail={contactEmail} />}
    </PanelShell>
  );
}

function PlansPage({ cafe, t, lang, contactEmail }: PanelProps & { contactEmail: string | null }) {
  const name = (plan: CafePlanKey) => PLANS[plan].name[lang];
  const left = trialDaysLeft(cafe);
  const ask = (plan: CafePlanKey) =>
    contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent(fill(t("planAskSubject"), { cafe: cafe.name, plan: name(plan) }))}` : null;

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("planTitle")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("planHelp")}</p>
      </section>

      <section className="flex flex-col gap-1 rounded-3xl bg-panel p-5">
        <p className="text-lg font-semibold">{fill(t("planNow"), { plan: name(cafe.plan.now) })}</p>
        {left > 0 ? (
          <p className="text-sm text-muted">
            {left === 1 ? t("planTrialLastDay") : fill(t("planTrialLeft"), { n: left })} · {fill(t("planTrialThen"), { plan: name(cafe.plan.paid) })}
          </p>
        ) : (
          cafe.plan.trialEndsAt && cafe.plan.paid === "topluluk" && <p className="text-sm text-muted">{t("planTrialOver")}</p>
        )}
      </section>

      <ul className="grid gap-4 sm:grid-cols-3">
        {ORDER.map((plan) => {
          const d = PLANS[plan];
          // During the trial the café "has" İşletme; the plan it pays for is the one marked.
          const current = plan === cafe.plan.paid;
          const href = current ? null : ask(plan);
          return (
            <li key={plan} className={`flex flex-col gap-4 rounded-3xl border p-5 ${current ? "border-ink" : "border-line"}`}>
              <div className="flex flex-col gap-1">
                {current && <span className="text-xs font-semibold text-muted uppercase">{t(left > 0 ? "planAfterTrial" : "planCurrent")}</span>}
                <h2 className="font-serif text-2xl leading-tight">{d.name[lang]}</h2>
                <p className="tabular text-lg font-semibold">{d.monthlyKurus ? fill(t("planMonthly"), { price: formatTL(d.monthlyKurus) }) : t("planFree")}</p>
                {d.yearlyKurus && <p className="text-sm text-muted">{fill(t("planYearly"), { price: formatTL(d.yearlyKurus) })}</p>}
              </div>
              <ul className="flex flex-1 flex-col gap-2 text-sm leading-normal">
                {t(HAS[plan])
                  .split("|")
                  .map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden="true">✓</span>
                      <span>{line}</span>
                    </li>
                  ))}
              </ul>
              {href && (
                <a href={href} className="inline-flex min-h-12 items-center justify-center rounded-full border border-line px-4 text-center text-sm font-semibold">
                  {t("planAsk")}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted">
        {t("planVat")}
        {!contactEmail && ` ${t("planAskNoEmail")}`}
      </p>
    </>
  );
}
