"use client";

import type { CafeMemberDTO, FullWalletDTO, GiftDTO, RecentRecipientDTO, SendGiftInput } from "@peni/api";
import { dativeName, goods } from "@peni/brand/format";
import { useEffect, useState } from "react";
import { api } from "../kasa/api";
import { Button, Notice } from "../kasa/ui";
import { CafeLine, EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { errorText, fill, text, type Lang, type T } from "../p/text";
import { GiftActions, ShareLink } from "../hediye/parts";

/** Whom the treat goes to, as the server wants it, and how to say their name. */
interface Recipient {
  to: Pick<SendGiftInput, "toMemberId" | "toCode" | "toPhone">;
  label: string;
  firstName: string;
}

type Mode = "list" | "code" | "phone";
const AMOUNTS = [10, 20, 50];

const label = (p: { firstName: string; lastInitial: string | null }) => (p.lastInitial ? `${p.firstName} ${p.lastInitial}.` : p.firstName);

/** "0532 000 00 01" or "5320000001" as +905320000001; anything else as typed. */
function e164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+9${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  return raw.trim();
}

/** `/ismarla`: pick the café, the person and the amount, then share the treat's link. */
export function SendTreat({ cafeSlug }: { cafeSlug: string | null }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [wallet, setWallet] = useState<FullWalletDTO | null>(null);
  const [cafe, setCafe] = useState<string | null>(cafeSlug);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [sent, setSent] = useState<GiftDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    api.wallet.get().then(
      (w) => {
        setWallet(w);
        setCafe((c) => (c && w.cafes.some((x) => x.cafeSlug === c) ? c : w.cafes.length === 1 ? w.cafes[0]!.cafeSlug : null));
      },
      (e: unknown) => setError(errorText(e, lang)),
    );
  }, [signedIn, lang]);

  const here = wallet?.cafes.find((c) => c.cafeSlug === cafe) ?? null;
  const restart = () => {
    setSent(null);
    setRecipient(null);
    setError(null);
    api.wallet.get().then(setWallet, () => {});
  };

  let body;
  if (signedIn === null || (signedIn && !wallet && !error)) body = <p className="text-muted">{t("loading")}</p>;
  else if (!signedIn) body = <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("signInToTreat")} onSignedIn={async () => markSignedIn()} />;
  else if (wallet && wallet.cafes.length === 0) body = <p className="text-lg">{t("treatNoCafe")}</p>;
  else if (wallet && !here) {
    body = (
      <section className="flex flex-col gap-3">
        <h1 className="font-serif text-4xl leading-tight">{t("treatWhichCafe")}</h1>
        {wallet.cafes.map((c) => (
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
  } else if (wallet && here && sent) {
    body = (
      <section className="flex flex-col gap-6" aria-live="polite">
        <CafeLine name={here.cafeName} />
        {sent.status === "pending" ? (
          <>
            <h1 className="font-serif text-4xl leading-tight">
              {fill(t("sent"), { name: lang === "tr" ? dativeName(recipient!.firstName) : recipient!.firstName, n: sent.peni })}
            </h1>
            <p className="text-muted">
              {fill(t("sentBody"), { h: Math.round((Date.parse(sent.expiresAt) - Date.parse(sent.createdAt)) / 3_600_000) })}
            </p>
            <p>{t("shareHelp")}</p>
            <ShareLink gift={sent} t={t} />
          </>
        ) : (
          <h1 className="font-serif text-3xl leading-tight">{t("takenBack")}</h1>
        )}
        <GiftActions gift={sent} t={t} lang={lang} onChange={setSent} onError={setError} />
        <Button kind="bare" size="sm" onClick={restart}>
          {t("treatAnother")}
        </Button>
      </section>
    );
  } else if (wallet && here) {
    body = (
      <section className="flex flex-col gap-6">
        <CafeLine name={here.cafeName} />
        {recipient ? (
          <Amount
            t={t}
            lang={lang}
            cafeSlug={here.cafeSlug}
            balance={here.balancePeni}
            refItems={here.refItems}
            recipient={recipient}
            onChange={() => setRecipient(null)}
            onSent={setSent}
            onError={setError}
          />
        ) : (
          <Who
            t={t}
            lang={lang}
            cafeSlug={here.cafeSlug}
            recents={wallet.recentRecipients.filter((r) => r.cafeSlug === here.cafeSlug)}
            onPick={(r) => (setError(null), setRecipient(r))}
            onError={setError}
          />
        )}
        {wallet.cafes.length > 1 && !recipient && (
          <Button kind="bare" size="sm" onClick={() => setCafe(null)}>
            {t("otherCafe")}
          </Button>
        )}
      </section>
    );
  }

  return (
    <Shell lang={lang} onLang={toggleLang} hue={here?.hue ?? null}>
      {body}
      {error && <Notice tone="red">{error}</Notice>}
    </Shell>
  );
}

/** "Kime ısmarlıyorsun?": someone treated before, a member from the list, a Peni kodu or a phone. */
function Who({
  t,
  lang,
  cafeSlug,
  recents,
  onPick,
  onError,
}: {
  t: T;
  lang: Lang;
  cafeSlug: string;
  recents: RecentRecipientDTO[];
  onPick: (r: Recipient) => void;
  onError: (m: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("list");
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<CafeMemberDTO[] | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "list") return;
    const timer = setTimeout(() => api.cafes.members(cafeSlug, q.trim() || undefined).then((r) => setMembers(r.members), () => setMembers([])), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [mode, q, cafeSlug]);

  const find = async () => {
    setBusy(true);
    onError(null);
    try {
      const by = mode === "code" ? { code: typed.trim() } : { phone: e164(typed) };
      const found = await api.cafes.lookupMember(cafeSlug, by);
      onPick({ to: mode === "code" ? { toCode: by.code } : { toPhone: by.phone }, label: label(found), firstName: found.firstName });
    } catch (e) {
      onError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const tabs: [Mode, string][] = [
    ["list", t("byList")],
    ["code", t("byCode")],
    ["phone", t("byPhone")],
  ];
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-4xl leading-tight">{t("treatWho")}</h1>
        <p className="text-muted">{t("treatOnlyHere")}</p>
      </div>
      {recents.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">{t("recents")}</h2>
          <div className="flex flex-wrap gap-2">
            {recents.map((r) => (
              <Button key={r.memberId} kind="quiet" size="sm" onClick={() => onPick({ to: { toMemberId: r.memberId }, label: label(r), firstName: r.firstName })}>
                {label(r)}
              </Button>
            ))}
          </div>
        </div>
      )}
      <div role="tablist" className="grid grid-cols-3 rounded-full bg-panel p-1">
        {tabs.map(([m, name]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => (setMode(m), setTyped(""), onError(null))}
            className={`min-h-11 cursor-pointer rounded-full text-sm ${mode === m ? "bg-paper font-medium text-ink shadow-sm" : "text-muted"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {mode === "list" ? (
        <div className="flex flex-col gap-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchMembers")}
            aria-label={t("searchMembers")}
            className="min-h-12 rounded-full border border-line bg-paper px-5 text-base outline-none focus:border-ink"
          />
          {members?.length === 0 && <p className="text-muted">{t("noMembers")}</p>}
          <ul className="flex flex-col">
            {members?.map((m) => (
              <li key={m.memberId}>
                <button
                  type="button"
                  onClick={() => onPick({ to: { toMemberId: m.memberId }, label: label(m), firstName: m.firstName })}
                  className="flex min-h-14 w-full cursor-pointer items-center gap-3 border-b border-line text-left"
                >
                  <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-panel text-sm font-medium">
                    {m.initials}
                  </span>
                  <span className="text-lg">{label(m)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">{t("listHelp")}</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) find();
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">{mode === "code" ? t("byCode") : t("phoneNumber")}</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode={mode === "phone" ? "tel" : "text"}
              autoCapitalize="none"
              autoComplete="off"
              placeholder={mode === "code" ? "M7K-42Q" : "0532 000 00 00"}
              className="tabular min-h-14 rounded-2xl border border-line bg-paper px-5 text-xl tracking-wider outline-none focus:border-ink"
            />
          </label>
          {mode === "code" && <p className="text-sm text-muted">{t("codeHelpTreat")}</p>}
          <Button kind="primary" size="md" type="submit" disabled={busy || !typed.trim()}>
            {t("find")}
          </Button>
        </form>
      )}
    </>
  );
}

/** "Kaç peni?": a few amounts to tap or one to type, a note, and the send. */
function Amount({
  t,
  lang,
  cafeSlug,
  balance,
  refItems,
  recipient,
  onChange,
  onSent,
  onError,
}: {
  t: T;
  lang: Lang;
  cafeSlug: string;
  balance: number;
  refItems: { name: string; priceKurus: number }[];
  recipient: Recipient;
  onChange: () => void;
  onSent: (g: GiftDTO) => void;
  onError: (m: string | null) => void;
}) {
  const [peni, setPeni] = useState(Math.min(20, balance));
  const [other, setOther] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // One key per treat (a new person remounts this): a retried tap sends it once.
  const [key] = useState(() => crypto.randomUUID());

  const send = async () => {
    setBusy(true);
    onError(null);
    try {
      onSent(await api.gifts.send({ cafeSlug, ...recipient.to, peni, message: note.trim() || undefined, idempotencyKey: key }));
    } catch (e) {
      onError(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  };

  const ok = peni >= 1 && peni <= balance;
  const name = lang === "tr" ? dativeName(recipient.firstName) : recipient.firstName;
  return (
    <>
      <div className="flex items-center justify-between rounded-2xl bg-panel px-5 py-4">
        <span className="text-xl font-medium">{recipient.label}</span>
        <Button kind="bare" size="sm" onClick={onChange}>
          {t("change")}
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h1 className="font-serif text-4xl leading-tight">{t("howMuch")}</h1>
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
        <p className="font-serif text-6xl leading-none text-[var(--cafe)] tabular">
          {peni} <span className="text-3xl">penny</span>
        </p>
        {goods(peni, refItems) && <p className="text-muted">≈ {goods(peni, refItems)}</p>}
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm text-muted">{t("note")}</span>
        <input
          value={note}
          maxLength={140}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          className="min-h-12 rounded-2xl border border-line bg-paper px-5 text-base outline-none focus:border-ink"
        />
      </label>
      <Button kind="primary" size="lg" disabled={busy || !ok} onClick={send} className="border-[var(--cafe)] bg-[var(--cafe)]">
        {busy ? t("sending") : fill(t("treatTo"), { name, n: peni })}
      </Button>
    </>
  );
}
