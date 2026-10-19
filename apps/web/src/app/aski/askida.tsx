"use client";

import type { AskidaWallEventDTO, CafeDetailDTO, CafeSummaryDTO } from "@peni/api";
import { goods } from "@peni/brand/format";
import { useCallback, useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { CafeLine, EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text, type Lang, type T } from "../p/text";

const AMOUNTS = [10, 30, 50];

/**
 * `/aski`: a café's askıda kahve. Anyone takes from it at the till, with no account and no
 * limit (D8), so this page only shows what's waiting and lets members leave peni on it.
 */
export function Askida({ cafeSlug }: { cafeSlug: string | null }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  const [cafe, setCafe] = useState<CafeDetailDTO | null>(null);
  const [slug, setSlug] = useState<string | null>(cafeSlug);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (s: string) => api.cafes.get(s).then(setCafe, (e: unknown) => setError(errorText(e, lang))),
    [lang],
  );
  useEffect(() => {
    if (signedIn === null) return;
    if (slug) void load(slug);
    else api.cafes.list().then((r) => setCafes(r.cafes), (e: unknown) => setError(errorText(e, lang)));
  }, [slug, signedIn, load, lang]);

  let body;
  if (error) body = <Notice tone="red">{error}</Notice>;
  else if (!slug) {
    body = (
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl leading-tight">{t("askidaTitle")}</h1>
        {cafes?.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setSlug(c.slug)}
            className="flex min-h-16 cursor-pointer items-center justify-between rounded-2xl border border-line bg-paper px-5 text-left"
          >
            <span className="text-lg">{c.name}</span>
            <span className="tabular text-muted">{c.askidaItemsAvailable}</span>
          </button>
        ))}
      </section>
    );
  } else if (!cafe) body = <p className="text-muted">{t("loading")}</p>;
  else {
    const askida = cafe.askida;
    const items = cafe.menu.filter((m) => m.askida && m.available);
    const waiting = goods(askida.balancePeni, items);
    body = (
      <>
        <section className="flex flex-col gap-4">
          <CafeLine name={cafe.name} />
          <h1 className="font-serif text-5xl leading-[1.05]">
            {!askida.enabled ? t("askidaOff") : waiting ? fill(t("askidaWaiting"), { goods: waiting }) : t("askidaNothing")}
          </h1>
          {askida.enabled && (
            <>
              <p className="text-lg leading-normal">{t("askidaHow")}</p>
              <p className="tabular text-muted">
                {fill(t("askidaPeni"), { n: askida.balancePeni })}
                {askida.claimedLast7Days > 0 && ` · ${fill(t("askidaWeek"), { n: askida.claimedLast7Days })}`}
              </p>
            </>
          )}
        </section>
        {askida.enabled && (
          <>
            <Leave t={t} lang={lang} cafe={cafe} signedIn={signedIn} onSignedIn={async () => markSignedIn()} onLeft={() => void load(cafe.slug)} />
            <Wall t={t} lang={lang} wall={askida.wall} />
          </>
        )}
      </>
    );
  }
  return (
    <Shell lang={lang} onLang={toggleLang} hue={cafe?.hue ?? null}>
      {body}
    </Shell>
  );
}

/** "Askıya bırak" with peni from the viewer's balance here, or how else to leave one. */
function Leave({
  t,
  lang,
  cafe,
  signedIn,
  onSignedIn,
  onLeft,
}: {
  t: T;
  lang: Lang;
  cafe: CafeDetailDTO;
  signedIn: boolean | null;
  onSignedIn: () => Promise<void>;
  onLeft: () => void;
}) {
  const balance = cafe.balancePeni ?? 0;
  const [peni, setPeni] = useState(Math.min(AMOUNTS[0]!, balance));
  const [other, setOther] = useState(false);
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<{ peni: number; matchedPeni: number } | null>(null);
  // One key per donation: a retried tap leaves it once.
  const [key, setKey] = useState(() => crypto.randomUUID());

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.askida.donate({ cafeSlug: cafe.slug, peni, showName, idempotencyKey: key });
      setLeft({ peni, matchedPeni: r.matchedPeni });
      setKey(crypto.randomUUID());
      setPeni(Math.min(peni, r.balancePeni));
      onLeft();
    } catch (e) {
      setError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  let inner;
  if (signedIn === false) inner = <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("askidaSignIn")} onSignedIn={onSignedIn} />;
  else if (signedIn && balance < 1 && !left) inner = <p className="text-muted">{t("askidaNoPeni")}</p>;
  else if (signedIn) {
    inner = (
      <>
        {left && (
          <p role="status" className="rounded-2xl bg-green-soft px-4 py-3 text-green">
            {fill(t("askidaLeft"), { n: left.peni })}
            {left.matchedPeni > 0 && ` ${fill(t("askidaMatched"), { n: left.matchedPeni })}`}
          </p>
        )}
        {balance >= 1 && (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-muted">{t("howMuch")}</span>
              <span className="text-muted">
                {t("yourBalance")}: <span className="tabular text-ink">{balance}</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label={t("howMuch")}>
              {AMOUNTS.map((n) => (
                <Button key={n} kind={!other && peni === n ? "primary" : "quiet"} size="md" disabled={n > balance} onClick={() => (setOther(false), setPeni(n))}>
                  {n}
                </Button>
              ))}
              <Button kind={other ? "primary" : "quiet"} size="md" onClick={() => setOther(true)}>
                {t("other")}
              </Button>
            </div>
            {other && (
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={balance}
                value={peni || ""}
                onChange={(e) => setPeni(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                aria-label={t("howMuch")}
                autoFocus
                className="tabular min-h-14 rounded-2xl border border-line bg-paper px-5 text-2xl outline-none focus:border-ink"
              />
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} className="size-5 accent-[var(--cafe)]" />
              <span>{t("askidaShowName")}</span>
            </label>
            {cafe.askida.matchPercent !== null && <p className="text-muted">{fill(t("askidaMatch"), { n: cafe.askida.matchPercent })}</p>}
            {error && <Notice tone="red">{error}</Notice>}
            <Button
              kind="primary"
              size="lg"
              disabled={busy || peni < 1 || peni > balance}
              onClick={leave}
              className="border-[var(--cafe)] bg-[var(--cafe)]"
            >
              {fill(t("askidaLeaveN"), { n: peni })}
            </Button>
          </>
        )}
      </>
    );
  }
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">{t("askidaLeave")}</h2>
      {inner}
      <p className="text-[15px] leading-normal text-muted">{t("askidaAtTill")}</p>
    </section>
  );
}

/** Who left what lately. Takings are never listed (§17). */
function Wall({ t, lang, wall }: { t: T; lang: Lang; wall: AskidaWallEventDTO[] }) {
  const when = (at: string) => new Date(at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const line = (e: AskidaWallEventDTO) => {
    if (e.type === "donation") return fill(t("wallDonation"), { name: e.donorName ?? t("wallSomeone"), n: e.peni });
    if (e.type === "till_donation") return fill(t("wallTill"), { n: e.peni });
    if (e.type === "cafe_match") return fill(t("wallMatch"), { n: e.peni });
    return null;
  };
  const rows = wall.map((e) => ({ e, text: line(e) })).filter((r) => r.text);
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-6">
      <h2 className="text-xl font-semibold">{t("askidaWall")}</h2>
      {rows.length === 0 && <p className="text-muted">{t("wallEmpty")}</p>}
      <ul className="flex flex-col">
        {rows.map(({ e, text }, i) => (
          <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-3">
            <span>{text}</span>
            <span className="tabular shrink-0 text-sm text-muted">{when(e.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
