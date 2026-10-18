"use client";

import type { FullWalletDTO, GiftDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Notice } from "../kasa/ui";
import { EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, text, type T } from "../p/text";
import { GiftActions, giftStatus } from "../hediye/parts";

/** `/hediyeler`: "Ismarlamalar". */
export function Treats() {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [wallet, setWallet] = useState<FullWalletDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.wallet.get().then(setWallet, (e: unknown) => setError(errorText(e, lang))), [lang]);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);
  // A treat answered here moves from "waiting" to "earlier", and balances change.
  const changed = (gift: GiftDTO) => {
    setWallet((w) => (w ? { ...w, gifts: w.gifts.map((g) => (g.id === gift.id ? gift : g)) } : w));
    load();
  };

  let body;
  if (signedIn === null || (signedIn && !wallet && !error)) body = <p className="text-muted">{t("loading")}</p>;
  else if (!signedIn) body = <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("signInToTreat")} onSignedIn={async () => markSignedIn()} />;
  else if (wallet) {
    const waiting = wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending");
    const earlier = wallet.gifts.filter((g) => !waiting.includes(g));
    body = (
      <>
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-4xl leading-tight">{t("treats")}</h1>
          {wallet.cafes.length > 0 ? (
            <a href="/ismarla" className="flex min-h-14 items-center justify-center rounded-full bg-ink px-6 text-lg font-medium text-paper">
              {t("treatSomeone")}
            </a>
          ) : (
            <p className="text-muted">{t("treatNoCafe")}</p>
          )}
        </section>
        {waiting.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t("waitingForYou")}>
            <h2 className="text-sm font-medium text-muted">{t("waitingForYou")}</h2>
            {waiting.map((g) => (
              <article key={g.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-lg font-medium">{g.fromName}</p>
                    <p className="text-sm text-muted">{g.cafeName}</p>
                  </div>
                  <p className="tabular font-serif text-3xl">{g.peni} peni</p>
                </div>
                {g.message && <p className="font-serif text-xl leading-snug">“{g.message}”</p>}
                <GiftActions gift={g} t={t} lang={lang} onChange={changed} onError={setError} />
              </article>
            ))}
          </section>
        )}
        <section className="flex flex-col gap-1" aria-label={t("earlier")}>
          <h2 className="pb-2 text-sm font-medium text-muted">{t("earlier")}</h2>
          {earlier.length === 0 && <p className="text-muted">{t("noTreats")}</p>}
          {earlier.map((g) => (
            <Row key={g.id} gift={g} t={t} />
          ))}
        </section>
        {wallet.cafes.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t("yourCode")}>
            <h2 className="text-sm font-medium text-muted">{t("yourCode")}</h2>
            <p className="text-muted">{t("yourCodeHelp")}</p>
            {wallet.cafes.map((c) => (
              <div key={c.cafeSlug} className="flex items-baseline justify-between rounded-2xl bg-panel px-5 py-4">
                <span>{c.cafeName}</span>
                <span className="tabular text-xl font-semibold tracking-[0.12em]">{c.memberCode}</span>
              </div>
            ))}
          </section>
        )}
      </>
    );
  }
  return (
    <Shell lang={lang} onLang={toggleLang} hue={null}>
      {body}
      {error && <Notice tone="red">{error}</Notice>}
    </Shell>
  );
}

/** One earlier treat, in or out; its own page has the note and what can still be done. */
function Row({ gift, t }: { gift: GiftDTO; t: T }) {
  const incoming = gift.direction === "in";
  const counted = gift.status === "accepted" || (!incoming && gift.status === "pending");
  return (
    <a href={`/hediye/${encodeURIComponent(gift.id)}`} className="flex items-center justify-between gap-4 border-b border-line py-3">
      <span className="flex flex-col">
        <span>
          <span className="text-muted">{incoming ? t("from") : t("to")}:</span> {incoming ? gift.fromName : gift.toName}
        </span>
        <span className="text-sm text-muted">
          {gift.cafeName} · {giftStatus(gift, t)}
          {gift.thankedAt && !incoming ? " · ♥" : ""}
        </span>
      </span>
      <span className={`tabular shrink-0 text-lg ${counted ? "" : "text-muted line-through"}`}>
        {incoming ? "+" : "−"}
        {gift.peni}
      </span>
    </a>
  );
}

