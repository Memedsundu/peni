"use client";

import type { GiftPreviewDTO } from "@peni/api";
import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { capitalizeTr, dativeName, dativeTime, formatPeni, formatTime, locativeTime, numberWord, relDay, SEP, trUpper } from "@peni/brand/format";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { signInHref } from "@/components/auth/return-to";
import { Coin, Fis, FisDivider } from "@/components/brand";
import { Banner, Button } from "@/components/ui";
import { peni } from "@/lib/client";

/**
 * Gift landing (design-system.md §9.7, [G11]): the shared link of an ısmarlama. A centred
 * gift fiş with the café's coin, "Seni bir çay bekliyor" and who sent it; the action depends
 * on who is looking:
 *
 * - signed out: "Giriş yap ve kabul et" (back here after sign-in);
 * - the recipient: "Kabul et" (A7, the coin flips to "+30 PENİ") and then "Cüzdanına git";
 * - the sender: what happens next to their peni;
 * - anyone else signed in: the gift went to another number. (Gifts only ever go to existing
 *   members of the café, so joining could never make this visitor the recipient: the spec's
 *   "Kafeye katıl ve kabul et" would be a dead end, and is not offered.)
 *
 * Expired or declined: "Bu ısmarlamanın süresi doldu. Peni Ayşe'ye döndü."
 */
export function GiftLanding({ gift }: { gift: GiftPreviewDTO }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "1 çay" never breaks between the number and the item.
  const what = (gift.goods ?? formatPeni(gift.peni)).replace(/(\d) /g, "$1\u00A0");
  const cafe = { name: gift.cafeName, slug: gift.cafeSlug };
  const legend = `ISMARLAMA${SEP}${trUpper(gift.cafeName)}`;
  const status = accepted ? "accepted" : gift.status;
  const viewer = gift.viewer;
  const returned = status === "expired" || status === "declined";

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await peni.gifts.accept(gift.id);
      setAccepted(true);
    } catch (e) {
      setError(e instanceof PeniApiError ? e.message : errorCopy.generic);
    } finally {
      setBusy(false);
    }
  };

  let title: string;
  let body: string | null = null;
  let note: string | null = null;
  let action: React.ReactNode = null;

  if (returned) {
    title = "Bu ısmarlamanın süresi doldu.";
    body = viewer === "sender" ? "Peni sana döndü." : `Peni ${dativeName(gift.fromFirstName)} döndü.`;
    action = (
      <Button variant="secondary" fullWidth href={`/k/${gift.cafeSlug}`}>
        Kafeye git
      </Button>
    );
  } else if (viewer === "sender") {
    title = `${capitalizeTr(spoken(what))} ısmarladın`;
    body = status === "accepted" ? `${gift.cafeName} için. Kabul edildi.` : `${gift.cafeName} için. Henüz kabul edilmedi.`;
    note = status === "pending" ? `Kabul edilmezse peni ${relDay(gift.expiresAt)} ${locativeTime(formatTime(gift.expiresAt))} sana döner.` : null;
    action = (
      <Button variant="secondary" fullWidth href="/cuzdan">
        Cüzdanına git
      </Button>
    );
  } else if (status === "accepted") {
    if (viewer === "recipient") {
      title = "Afiyet olsun!";
      body = `${formatPeni(gift.peni)} cüzdanında.`;
      action = (
        <Button fullWidth href="/cuzdan">
          Cüzdanına git
        </Button>
      );
    } else {
      title = "Bu ısmarlama kabul edildi.";
      body = `${gift.fromFirstName}, ${gift.cafeName} için ${what} ısmarlamıştı.`;
      action = (
        <Button variant="secondary" fullWidth href="/">
          {actionCopy.browseCafes}
        </Button>
      );
    }
  } else {
    title = `Seni ${spoken(what)} bekliyor`;
    body = `${gift.fromFirstName} sana ${gift.cafeName} için ${what} ısmarladı.`;
    note = `${capitalizeTr(relDay(gift.expiresAt))} ${dativeTime(formatTime(gift.expiresAt))} kadar kabul edebilirsin.`;
    if (viewer === "signed_out") {
      action = (
        <Button fullWidth href={signInHref(`/hediye/${gift.id}`)}>
          Giriş yap ve kabul et
        </Button>
      );
    } else if (viewer === "recipient") {
      action = (
        <Button fullWidth loading={busy} loadingLabel="Kabul ediliyor…" onClick={() => void accept()}>
          Kabul et
        </Button>
      );
    } else {
      // Signed in, but the gift went to someone else's number.
      title = `${gift.fromFirstName} ${spoken(what)} ısmarladı`;
      body = "Bu ısmarlama başka bir numaraya gönderildi.";
      note = "Sana geldiyse, o numarayla giriş yap.";
      action = (
        <Button variant="secondary" fullWidth href={`/k/${gift.cafeSlug}`}>
          Kafeye git
        </Button>
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[440px] md:pt-6">
      <Fis variant="gift" legend={legend} as="article" bodyClassName="pb-8">
        <div className="mt-6 flex flex-col items-center text-center">
          {returned ? (
            <span aria-hidden className="grid size-24 place-items-center rounded-full bg-surface-2 text-ink-2">
              <Undo2 size={40} strokeWidth={1.5} />
            </span>
          ) : (
            <Coin
              size={96}
              cafe={cafe}
              animate={accepted ? "flip" : null}
              backLabel={formatPeni(gift.peni, { signed: true }).replace(" peni", "")}
            />
          )}
          <div aria-live="polite" className="mt-5 flex flex-col items-center">
            <h1 className="font-display text-h2 text-ink">{title}</h1>
            {body && <p className="mt-2 max-w-[34ch] text-body-lg text-ink-2">{body}</p>}
          </div>
          {note && <p className="mt-2 text-meta text-ink-2">{note}</p>}
        </div>

        <FisDivider className="mt-6 mb-5" />
        {error && <Banner tone="danger" title={error} className="mb-4" />}
        {action}
      </Fis>
    </div>
  );
}

/** "1 çay" → "bir çay", "2 çay" → "iki çay": goods as they are said in a headline. */
function spoken(goods: string): string {
  const m = /^(\d+)[ \u00A0](.+)$/.exec(goods);
  return m ? `${numberWord(Number(m[1]))} ${m[2]}` : goods;
}
