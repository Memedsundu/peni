"use client";

import type { SpendCodeDTO, WalletCafeDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Qr } from "../kasa/qr";
import { Button, Notice } from "../kasa/ui";
import { CafeLine, EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, text } from "../p/text";

/** "Ödeme kodum" (plan piece 11): the code to show at the till to spend peni at one café. */
export function SpendCode({ cafeSlug }: { cafeSlug: string | null }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafes, setCafes] = useState<WalletCafeDTO[] | null>(null);
  const [cafe, setCafe] = useState<string | null>(cafeSlug);
  const [code, setCode] = useState<SpendCodeDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!signedIn) return;
    api.wallet.get().then(
      (w) => {
        setCafes(w.cafes);
        // One café, or the one the link named: straight to its code.
        setCafe((c) => (c && w.cafes.some((x) => x.cafeSlug === c) ? c : w.cafes.length === 1 ? w.cafes[0]!.cafeSlug : null));
      },
      (e: unknown) => setError(errorText(e, lang)),
    );
  }, [signedIn, lang]);

  const fetchCode = useCallback(
    (slug: string) => {
      setError(null);
      api.wallet.spendCode(slug).then(setCode, (e: unknown) => setError(errorText(e, lang)));
    },
    [lang],
  );
  useEffect(() => {
    if (cafe) fetchCode(cafe);
    else setCode(null);
  }, [cafe, fetchCode]);

  // A second hand for the countdown; a code that runs out is replaced while the page is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = code ? Math.max(0, Math.round((Date.parse(code.expiresAt) - now) / 1000)) : 0;
  useEffect(() => {
    if (code && left === 0 && document.visibilityState === "visible") fetchCode(code.cafeSlug);
  }, [code, left, fetchCode]);

  let body;
  if (signedIn === null) body = <p className="text-muted">{t("loading")}</p>;
  else if (!signedIn) body = <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("signInToSpend")} onSignedIn={async () => markSignedIn()} />;
  else if (cafes && cafes.length === 0) body = <p className="text-lg">{t("spendNoCafe")}</p>;
  else if (!cafe) {
    body = (
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl leading-tight">{t("spendWhichCafe")}</h1>
        {cafes?.map((c) => (
          <button
            key={c.cafeSlug}
            type="button"
            onClick={() => setCafe(c.cafeSlug)}
            className="flex min-h-16 cursor-pointer items-center justify-between rounded-2xl border border-line bg-paper px-5 text-left"
          >
            <span className="text-lg">{c.cafeName}</span>
            <span className="tabular text-muted">{c.balancePeni} peni</span>
          </button>
        ))}
      </section>
    );
  } else if (code) {
    const pretty = `${code.code.slice(0, 3)} ${code.code.slice(3)}`;
    body = (
      <section className="flex flex-col items-center gap-6 text-center">
        <div className="self-start">
          <CafeLine name={code.cafeName} />
        </div>
        <h1 className="self-start font-serif text-4xl leading-tight">{t("spendTitle")}</h1>
        <div className={left === 0 ? "opacity-30" : ""}>
          <Qr value={code.code} size={240} label={t("spendTitle")} />
        </div>
        <p className="tabular text-5xl font-semibold tracking-[0.15em]" aria-label={code.code.split("").join(" ")}>
          {pretty}
        </p>
        <p className="text-muted">
          {t("spendValid")}: <span className="tabular text-ink">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</span>
        </p>
        <div className="flex w-full items-baseline justify-between rounded-2xl bg-panel px-5 py-4">
          <span className="text-muted">{t("balance")}</span>
          <span className="tabular text-2xl font-semibold">{code.balancePeni} peni</span>
        </div>
        <p className="text-left text-muted">{t("spendHelp")}</p>
        <Button kind="quiet" size="md" className="w-full" onClick={() => fetchCode(code.cafeSlug)}>
          {t("spendRenew")}
        </Button>
        {cafes && cafes.length > 1 && (
          <Button kind="bare" size="sm" onClick={() => setCafe(null)}>
            {t("otherCafe")}
          </Button>
        )}
      </section>
    );
  } else body = <p className="text-muted">{t("loading")}</p>;

  return (
    <Shell lang={lang} onLang={toggleLang} hue={code?.hue ?? null}>
      {body}
      {error && <Notice tone="red">{error}</Notice>}
    </Shell>
  );
}
