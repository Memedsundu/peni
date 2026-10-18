"use client";

import type { CafeHue, CafeSummaryDTO, ClaimDTO, TakeClaimInput } from "@peni/api";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { errorText, text, type Lang, type T } from "./text";

/** Each café's own colour on its customer pages; Peni's green when it hasn't picked one. */
const HUES: Record<CafeHue | "peni", { light: string; dark: string }> = {
  peni: { light: "#1e4d3b", dark: "#8cc4a6" },
  zeytin: { light: "#55602f", dark: "#b9c48a" },
  lacivert: { light: "#1f3a5f", dark: "#9db8dc" },
  murekkep: { light: "#2b2f4a", dark: "#b3b7d6" },
  patlican: { light: "#4a2740", dark: "#d2a6c5" },
};

export function useLang(): [Lang, () => void] {
  const [lang, setLang] = useState<Lang>("tr");
  useEffect(() => {
    try {
      if (localStorage.getItem("peni.lang") === "en") setLang("en");
    } catch {}
  }, []);
  const toggle = () =>
    setLang((l) => {
      const next = l === "tr" ? "en" : "tr";
      try {
        localStorage.setItem("peni.lang", next);
      } catch {}
      return next;
    });
  return [lang, toggle];
}

/** Whether a customer session cookie is there: `/me` answers only when signed in. */
export function useSignedIn(): [boolean | null, () => void] {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    api.me.get().then(
      () => setSignedIn(true),
      () => setSignedIn(false),
    );
  }, []);
  return [signedIn, () => setSignedIn(true)];
}

export function Shell({ lang, onLang, hue, children }: { lang: Lang; onLang: () => void; hue: CafeHue | null; children: ReactNode }) {
  const colour = HUES[hue ?? "peni"];
  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-6 pb-12 pt-6 [--cafe:var(--cafe-light)] dark:[--cafe:var(--cafe-dark)]"
      style={{ ["--cafe-light" as string]: colour.light, ["--cafe-dark" as string]: colour.dark }}
    >
      <header className="flex items-center justify-between">
        <a href="/" className="font-serif text-2xl">
          Peni
        </a>
        <Button kind="bare" size="sm" onClick={onLang} aria-label={lang === "tr" ? "English" : "Türkçe"}>
          {lang === "tr" ? "EN" : "TR"}
        </Button>
      </header>
      {children}
    </main>
  );
}

export function CafeLine({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--cafe)]" />
      {name}
    </p>
  );
}

function Amount({ peni, goods, caption }: { peni: number; goods: string | null; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-serif text-7xl leading-none text-[var(--cafe)] tabular">
        {peni} <span className="text-4xl">peni</span>
      </p>
      <p className="text-lg">
        {caption}
        {goods ? <span className="text-muted"> · {goods}</span> : null}
      </p>
    </div>
  );
}

/** After taking it: the peni, the balance, and how to spend it. */
function Taken({ claim, t }: { claim: ClaimDTO; t: T }) {
  return (
    <section className="flex flex-col gap-6" aria-live="polite">
      <CafeLine name={claim.cafeName} />
      <Amount peni={claim.peni} goods={claim.goods} caption={t("yours")} />
      <div className="flex items-baseline justify-between rounded-2xl bg-panel px-5 py-4">
        <span className="text-muted">{t("balance")}</span>
        <span className="text-2xl font-semibold tabular">{claim.balancePeni} peni</span>
      </div>
      {claim.joined ? <p>{t("joined")}</p> : null}
      <p className="text-muted">
        {t("spendHint")}{" "}
        <a href={`/harca?kafe=${encodeURIComponent(claim.cafeSlug)}`} className="font-medium text-ink underline underline-offset-4">
          {t("mySpendCode")}
        </a>
      </p>
    </section>
  );
}

function Closed({ claim, t }: { claim: ClaimDTO; t: T }) {
  const [title, body] =
    claim.state === "taken" ? [t("taken"), t("takenBody")] : claim.state === "expired" ? [t("expired"), t("expiredBody")] : [t("cancelled"), t("cancelledBody")];
  return (
    <section className="flex flex-col gap-4">
      <CafeLine name={claim.cafeName} />
      <h1 className="font-serif text-4xl leading-tight">{title}</h1>
      <p className="text-muted">{body}</p>
    </section>
  );
}

/**
 * Email sign-in in two steps. `action` names the last button ("Giriş yap ve al"), and
 * `onSignedIn` runs right after, so taking the peni needs no extra tap.
 */
export function EmailSignIn({ t, lang, action, onSignedIn, prompt }: { t: T; lang: Lang; action: string; onSignedIn: () => Promise<void>; prompt?: string }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api.auth.providers().then(
      (p) => setEnabled(p.email),
      () => setEnabled(true),
    );
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await api.auth.emailStart(email.trim());
      setSentTo(email.trim());
      setCode("");
    });
  const verify = () =>
    run(async () => {
      await api.auth.emailVerify({ email: sentTo!, code });
      await onSignedIn();
    });

  if (enabled === false) return <Notice>{t("emailOff")}</Notice>;
  const field = "min-h-14 w-full rounded-2xl border border-line bg-paper px-4 text-lg outline-none focus:border-ink";
  return (
    <section className="flex flex-col gap-4">
      <p className="text-lg">{prompt ?? t("signInFirst")}</p>
      {!sentTo ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), send())}>
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("email")}
            <input className={field} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <Button type="submit" kind="primary" size="lg" disabled={busy || !email.includes("@")}>
            {busy ? t("sending") : t("sendCode")}
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), verify())}>
          <p className="text-sm text-muted">
            {t("codeSent")} <span className="text-ink">{sentTo}</span>
          </p>
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("emailCode")}
            <input
              className={`${field} tracking-[0.4em] tabular`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
          </label>
          <Button type="submit" kind="primary" size="lg" disabled={busy || code.length !== 6}>
            {busy ? t("taking") : action}
          </Button>
          <Button kind="bare" size="sm" onClick={() => setSentTo(null)}>
            {t("otherEmail")}
          </Button>
        </form>
      )}
      {error ? <Notice tone="red">{error}</Notice> : null}
    </section>
  );
}

/** What the customer screen's QR opens: `/p/<token>`. */
export function ClaimByToken({ token }: { token: string }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [claim, setClaim] = useState<ClaimDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.claims.get(token).then(setClaim, () => setMissing(true));
  }, [token]);

  const take = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setClaim(await api.claims.take({ token }));
    } catch (e) {
      setError(errorText(e, lang));
      // It may have closed or gone to someone else meanwhile: show where it stands.
      api.claims.get(token).then(setClaim, () => {});
    } finally {
      setBusy(false);
    }
  }, [token, lang]);

  let body: ReactNode;
  if (missing) body = <h1 className="font-serif text-4xl leading-tight">{t("notFound")}</h1>;
  else if (!claim || signedIn === null) body = <p className="text-muted">{t("loading")}</p>;
  else if (claim.state === "yours") body = <Taken claim={claim} t={t} />;
  else if (claim.state !== "open") body = <Closed claim={claim} t={t} />;
  else
    body = (
      <>
        <section className="flex flex-col gap-4">
          <CafeLine name={claim.cafeName} />
          <Amount peni={claim.peni} goods={claim.goods} caption={t("waiting")} />
          <p className="text-muted">{t("waitingBody")}</p>
        </section>
        {signedIn ? (
          <Button kind="primary" size="lg" onClick={take} disabled={busy} className="bg-[var(--cafe)] border-[var(--cafe)]">
            {busy ? t("taking") : t("take")}
          </Button>
        ) : (
          <EmailSignIn t={t} lang={lang} action={t("signInAndTake")} onSignedIn={async () => (markSignedIn(), take())} />
        )}
        {error ? <Notice tone="red">{error}</Notice> : null}
      </>
    );
  return (
    <Shell lang={lang} onLang={toggleLang} hue={claim?.hue ?? null}>
      {body}
    </Shell>
  );
}

/** `/p`: the 4-digit code for when the camera can't read the QR. */
export function ClaimByCode({ cafeSlug }: { cafeSlug: string | null }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  const [cafe, setCafe] = useState<string>(cafeSlug ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState<ClaimDTO | null>(null);

  useEffect(() => {
    api.cafes.list().then(
      ({ cafes }) => {
        setCafes(cafes);
        // One café, or the one the link named: nothing to pick.
        setCafe((c) => (c && cafes.some((x) => x.slug === c) ? c : cafes.length === 1 ? cafes[0]!.slug : c || (cafes.find((x) => x.isMember)?.slug ?? "")));
      },
      () => setCafes([]),
    );
  }, []);

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: TakeClaimInput = { cafeSlug: cafe, code };
      setTaken(await api.claims.take(input));
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const ready = !!cafe && code.length === 4;
  const hue = taken?.hue ?? null;
  if (taken) {
    return (
      <Shell lang={lang} onLang={toggleLang} hue={hue}>
        <Taken claim={taken} t={t} />
        <Button kind="quiet" size="md" onClick={() => (setTaken(null), setCode(""))}>
          {t("another")}
        </Button>
      </Shell>
    );
  }
  return (
    <Shell lang={lang} onLang={toggleLang} hue={hue}>
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl leading-tight">{t("codeTitle")}</h1>
        <p className="text-muted">{t("codeBody")}</p>
      </section>
      <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), ready && signedIn && take())}>
        {cafes && cafes.length > 1 ? (
          <label className="flex flex-col gap-2 text-sm text-muted">
            {t("whichCafe")}
            <select className="min-h-14 rounded-2xl border border-line bg-paper px-4 text-lg text-ink" value={cafe} onChange={(e) => setCafe(e.target.value)}>
              <option value="" disabled>
                {t("whichCafe")}
              </option>
              {cafes.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                  {c.district ? ` · ${c.district}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-2 text-sm text-muted">
          {t("code")}
          <input
            className="min-h-20 w-full rounded-2xl border border-line bg-paper px-4 text-center font-serif text-5xl tracking-[0.5em] tabular text-ink outline-none focus:border-ink"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            aria-label={t("code")}
          />
        </label>
        {signedIn ? (
          <Button type="submit" kind="primary" size="lg" disabled={busy || !ready}>
            {busy ? t("taking") : t("take")}
          </Button>
        ) : null}
      </form>
      {signedIn === false ? (
        <EmailSignIn
          t={t}
          lang={lang}
          action={ready ? t("signInAndTake") : t("signIn")}
          onSignedIn={async () => {
            markSignedIn();
            if (ready) await take();
          }}
        />
      ) : null}
      {error ? <Notice tone="red">{error}</Notice> : null}
      <p className="text-sm text-muted">{t("scanInstead")}</p>
    </Shell>
  );
}
