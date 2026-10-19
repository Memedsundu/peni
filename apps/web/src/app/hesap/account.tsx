"use client";

import type { FullWalletDTO, MeDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text } from "../p/text";

/** `/hesap`: who you are here, your peni at each café, "Verilerimi indir" and "Hesabımı sil". */
export function Account() {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [me, setMe] = useState<MeDTO | null>(null);
  const [wallet, setWallet] = useState<FullWalletDTO | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.me.get(), api.wallet.get()]).then(
      ([m, w]) => {
        setMe(m);
        setWallet(w);
      },
      (e: unknown) => setError(errorText(e, lang)),
    );
  }, [lang]);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  const download = async () => {
    setError(null);
    try {
      const data = await api.me.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `peni-verilerim-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorText(e, lang));
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.me.deleteAccount();
      setDeleted(true);
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  let body;
  if (deleted) body = <p className="font-serif text-3xl leading-snug">{t("accountDeleted")}</p>;
  else if (signedIn === null || (signedIn && !me && !error)) body = <p className="text-muted">{t("loading")}</p>;
  else if (!signedIn) body = <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("signInToAccount")} onSignedIn={async () => markSignedIn()} />;
  else if (me && wallet) {
    const total = wallet.cafes.reduce((s, c) => s + c.balancePeni, 0);
    body = (
      <>
        <section className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl leading-tight">{me.customer.displayName}</h1>
          {me.customer.email && <p className="text-muted">{me.customer.email}</p>}
        </section>
        {wallet.cafes.length > 0 && (
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {wallet.cafes.map((c) => (
              <li key={c.membershipId} className="flex items-baseline justify-between gap-4 py-3">
                <span>{c.cafeName}</span>
                <span className="tabular font-medium">{c.balancePeni} peni</span>
              </li>
            ))}
          </ul>
        )}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{t("yourData")}</h2>
          <p>{t("downloadDataHelp")}</p>
          <Button kind="quiet" onClick={() => void download()}>
            {t("downloadData")}
          </Button>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{t("deleteAccount")}</h2>
          <p>{t("deleteAccountHelp")}</p>
          {!asking ? (
            <Button kind="quiet" className="text-red" onClick={() => setAsking(true)}>
              {t("deleteAccount")}
            </Button>
          ) : (
            <div role="alertdialog" aria-label={t("deleteAccountSure")} className="flex flex-col gap-4 rounded-2xl border border-red/40 bg-red-soft p-5">
              <p className="text-lg font-medium">{t("deleteAccountSure")}</p>
              <p>{total > 0 ? fill(t("deleteAccountPeni"), { peni: total }) : t("deleteAccountNoPeni")}</p>
              <div className="flex flex-wrap gap-3">
                <Button kind="danger" disabled={busy} onClick={() => void remove()}>
                  {busy ? t("deleting") : t("deleteAccountYes")}
                </Button>
                <Button kind="quiet" disabled={busy} onClick={() => setAsking(false)}>
                  {t("keepAccount")}
                </Button>
              </div>
            </div>
          )}
        </section>
      </>
    );
  }

  return (
    <Shell lang={lang} onLang={toggleLang} hue={null}>
      {body}
      {error && <Notice tone="red">{error}</Notice>}
      <footer className="mt-auto flex gap-6 text-sm text-muted">
        <a href={lang === "en" ? "/gizlilik?lang=en" : "/gizlilik"} className="underline-offset-4 hover:underline">
          {t("privacy")}
        </a>
        <a href={lang === "en" ? "/kosullar?lang=en" : "/kosullar"} className="underline-offset-4 hover:underline">
          {t("terms")}
        </a>
      </footer>
    </Shell>
  );
}
