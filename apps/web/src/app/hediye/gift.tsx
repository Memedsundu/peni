"use client";

import type { GiftDTO, GiftPreviewDTO } from "@peni/api";
import { dativeName } from "@peni/brand/format";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../kasa/api";
import { Notice } from "../kasa/ui";
import { Amount, CafeLine, EmailSignIn, Shell, useLang, useSignedIn } from "../p/claim";
import { fill, text, type Lang, type T } from "../p/text";
import { acceptBy, GiftActions, giftStatus, ShareLink } from "./parts";

/**
 * `/hediye/<id>`: anyone with the link sees who treated and how much; only the recipient
 * can accept it, and only the sender sees the note and can take it back.
 */
export function GiftByLink({ id }: { id: string }) {
  const [lang, toggleLang] = useLang();
  const t = text(lang);
  const [signedIn, markSignedIn] = useSignedIn();
  const [preview, setPreview] = useState<GiftPreviewDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.gifts.preview(id).then(setPreview, () => setMissing(true)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  const changed = (gift: GiftDTO) => setPreview((p) => (p ? { ...p, status: gift.status, gift } : p));

  let body: ReactNode;
  if (missing) body = <h1 className="font-serif text-4xl leading-tight">{t("treatNotFound")}</h1>;
  else if (!preview || signedIn === null) body = <p className="text-muted">{t("loading")}</p>;
  else if (preview.gift) body = <Mine preview={preview} gift={preview.gift} t={t} lang={lang} onChange={changed} onError={setError} />;
  else
    body = (
      <section className="flex flex-col gap-6">
        <CafeLine name={preview.cafeName} />
        <h1 className="font-serif text-4xl leading-tight">{fill(t("treatedSomeone"), { name: preview.fromFirstName })}</h1>
        <Amount peni={preview.peni} goods={preview.goods} caption={preview.status === "pending" ? t("outPending") : t("treatGone")} />
        {preview.viewer === "signed_out" ? (
          preview.status === "pending" && (
            <EmailSignIn t={t} lang={lang} action={t("signIn")} prompt={t("ifForYou")} onSignedIn={async () => (markSignedIn(), void (await load()))} />
          )
        ) : (
          <p className="text-lg">{t("notForYou")}</p>
        )}
      </section>
    );
  return (
    <Shell lang={lang} onLang={toggleLang} hue={preview?.hue ?? null}>
      {body}
      {error && <Notice tone="red">{error}</Notice>}
    </Shell>
  );
}

/** The recipient's or the sender's view: the note, where it stands, and what they can do. */
function Mine({ preview, gift, t, lang, onChange, onError }: { preview: GiftPreviewDTO; gift: GiftDTO; t: T; lang: Lang; onChange: (g: GiftDTO) => void; onError: (m: string | null) => void }) {
  const incoming = gift.direction === "in";
  const open = gift.status === "pending" || gift.status === "accepted";
  const title = incoming
    ? open
      ? fill(t("treatedYou"), { name: preview.fromFirstName })
      : t("treatGone")
    : fill(t("sent"), { name: lang === "tr" ? dativeName(gift.toName) : gift.toName, n: gift.peni });
  const caption = incoming
    ? gift.status === "accepted"
      ? t("inYourAccount")
      : gift.status === "pending"
        ? `${t("acceptBy")}: ${acceptBy(gift, lang)}`
        : t("declinedBody")
    : giftStatus(gift, t);
  return (
    <section className="flex flex-col gap-6" aria-live="polite">
      <CafeLine name={gift.cafeName} />
      <h1 className="font-serif text-4xl leading-tight">{title}</h1>
      <Amount peni={gift.peni} goods={preview.goods} caption={caption} />
      {gift.message && <blockquote className="border-l-2 border-[var(--cafe)] pl-4 font-serif text-2xl leading-snug">{gift.message}</blockquote>}
      <GiftActions gift={gift} t={t} lang={lang} onChange={onChange} onError={onError} />
      {!incoming && gift.status === "pending" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted">{t("shareHelp")}</p>
          <ShareLink gift={gift} t={t} />
        </div>
      )}
      {incoming && gift.status === "accepted" && (
        <p className="text-muted">
          {t("spendHint")}{" "}
          <a href={`/harca?kafe=${encodeURIComponent(gift.cafeSlug)}`} className="font-medium text-ink underline underline-offset-4">
            {t("mySpendCode")}
          </a>
        </p>
      )}
      <a href="/hediyeler" className="text-muted underline underline-offset-4">
        {t("myTreats")}
      </a>
    </section>
  );
}
