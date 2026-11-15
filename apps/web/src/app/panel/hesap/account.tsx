"use client";

import { useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { field, PanelShell, type PanelProps } from "../shell";
import { errorText } from "../text";

/**
 * Hesabım: the two things only the person themself sets. The till PIN (people tap their name
 * at the till and type it; without one they can't sign in there) and the password.
 */
export function Account({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="hesap">
      {(p) => <AccountPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function AccountPage({ cafe, t, lang }: PanelProps) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="font-serif text-5xl leading-none">{t("navAccount")}</h1>
        <p className="text-sm leading-normal text-muted">{t("accountHelp")}</p>
      </section>
      <Pin cafe={cafe} t={t} lang={lang} />
      <Password t={t} lang={lang} />
    </>
  );
}

function Pin({ cafe, t, lang }: Pick<PanelProps, "cafe" | "t" | "lang">) {
  const [has, setHas] = useState(cafe.hasPin);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const ready = pin.length >= 4 && again.length >= 4;

  const save = async () => {
    setSaved(false);
    if (pin !== again) return setError(t("pinMismatch"));
    setBusy(true);
    setError(null);
    try {
      await api.staff.setPin(cafe.slug, pin);
      setHas(true);
      setSaved(true);
      setPin("");
      setAgain("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-3xl border border-line p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void save();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-3xl">{t("pinTitle")}</h2>
        <p className="text-sm leading-normal text-muted">{t("pinHelp")}</p>
      </div>
      <p className={`text-sm font-semibold ${has ? "text-green" : ""}`}>{has ? t("pinHave") : t("pinNone")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("pinNew")}
          <input className={`${field} tabular min-h-12`} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("pinAgain")}
          <input className={`${field} tabular min-h-12`} type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
        </label>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      {saved && <p className="rounded-2xl bg-green-soft px-4 py-3 text-sm text-green">{t("pinSaved")}</p>}
      <Button kind="primary" type="submit" className="self-start" disabled={!ready || busy}>
        {t("pinSave")}
      </Button>
    </form>
  );
}

function Password({ t, lang }: Pick<PanelProps, "t" | "lang">) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ready = current.length > 0 && next.length >= 8;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.staff.changePassword({ currentPassword: current, newPassword: next });
      setSaved(true);
      setCurrent("");
      setNext("");
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-3xl border border-line p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) void save();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-3xl">{t("passwordTitle")}</h2>
        <p className="text-sm leading-normal text-muted">{t("passwordHelp")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("passwordCurrent")}
          <input className={`${field} min-h-12`} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("passwordNew")}
          <input className={`${field} min-h-12`} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
      </div>
      {error && <Notice tone="red">{error}</Notice>}
      {saved && <p className="rounded-2xl bg-green-soft px-4 py-3 text-sm text-green">{t("passwordSaved")}</p>}
      <Button kind="quiet" type="submit" className="self-start" disabled={!ready || busy}>
        {t("passwordSave")}
      </Button>
    </form>
  );
}
