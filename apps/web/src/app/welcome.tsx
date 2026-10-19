"use client";

import type { CafeSummaryDTO } from "@peni/api";
import { useEffect, useState } from "react";
import { api } from "./kasa/api";
import { Shell, useLang } from "./p/claim";
import { text } from "./p/text";

/** The store pages, once the apps are out (NEXT_PUBLIC_APP_STORE_URL, NEXT_PUBLIC_PLAY_STORE_URL). */
const STORES = [
  ["App Store", process.env.NEXT_PUBLIC_APP_STORE_URL],
  ["Google Play", process.env.NEXT_PUBLIC_PLAY_STORE_URL],
].filter((s): s is [string, string] => !!s[1]);

/** `/`: what Peni is, the cafés on it, and the two ways in (design DS16 to DS21). */
export function Welcome() {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  useEffect(() => {
    api.cafes.list().then(
      (r) => setCafes(r.cafes),
      () => setCafes([]),
    );
  }, []);
  const en = lang === "en" ? "?lang=en" : "";

  return (
    <Shell lang={lang} onLang={toggleLang} hue={null}>
      <section className="flex flex-col gap-5 pt-10">
        <h1 className="font-serif text-6xl leading-[1.05]">{t("welcomeHeadline")}</h1>
        <p className="text-lg text-muted">{t("welcomeBody")}</p>
      </section>
      {STORES.length > 0 && (
        <section className="flex flex-col gap-3" aria-label={t("getTheApp")}>
          {STORES.map(([name, href]) => (
            <a key={name} href={href} className="flex min-h-14 items-center justify-center rounded-full bg-ink px-6 text-lg font-medium text-paper">
              {name}
            </a>
          ))}
        </section>
      )}
      {cafes && cafes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{t("cafesOnPeni")}</h2>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {cafes.map((c) => (
              <li key={c.id}>
                <a href={`/kafe/${c.slug}`} className="flex items-baseline justify-between gap-4 py-4">
                  <span className="text-lg">{c.name}</span>
                  {c.district && <span className="text-sm text-muted">{c.district}</span>}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="flex flex-col gap-3 rounded-2xl bg-panel p-5">
        <h2 className="text-lg font-medium">{t("haveCafe")}</h2>
        <p className="text-muted">{t("haveCafeBody")}</p>
        <a href="/panel" className="font-medium underline underline-offset-4">
          {t("cafePanelLink")}
        </a>
      </section>
      <footer className="mt-auto flex gap-6 text-sm text-muted">
        <a href={`/gizlilik${en}`} className="underline-offset-4 hover:underline">
          {t("privacy")}
        </a>
        <a href={`/kosullar${en}`} className="underline-offset-4 hover:underline">
          {t("terms")}
        </a>
        <a href="/hesap" className="underline-offset-4 hover:underline">
          {t("account")}
        </a>
      </footer>
    </Shell>
  );
}
