"use client";

import type { GiftDTO } from "@peni/api";
import { useState } from "react";
import { api } from "../kasa/api";
import { Button } from "../kasa/ui";
import { errorText, fill, type Lang, type T } from "../p/text";

/** One line on where a treat stands, from the viewer's side. */
export function giftStatus(gift: GiftDTO, t: T): string {
  if (gift.direction === "in") {
    return { pending: t("inPending"), accepted: t("inAccepted"), declined: t("inDeclined"), expired: t("inExpired") }[gift.status];
  }
  if (gift.status === "declined") return gift.cancelledBySender ? t("outCancelled") : t("outDeclined");
  return { pending: t("outPending"), accepted: t("outAccepted"), expired: t("outExpired") }[gift.status];
}

/** "Son kabul: Cmt 14:20", in the viewer's own time. */
export function acceptBy(gift: GiftDTO, lang: Lang): string {
  return new Date(gift.expiresAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * What the viewer can do with a treat: accept or decline one waiting for them, say thanks
 * once it's theirs, or take back one they sent that nobody accepted yet.
 */
export function GiftActions({ gift, t, lang, onChange, onError }: { gift: GiftDTO; t: T; lang: Lang; onChange: (g: GiftDTO) => void; onError: (message: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const run = (call: () => Promise<GiftDTO>) => {
    setBusy(true);
    onError(null);
    call().then(onChange, (e: unknown) => onError(errorText(e, lang))).finally(() => setBusy(false));
  };

  if (gift.direction === "in" && gift.status === "pending") {
    return (
      <div className="flex flex-col gap-2">
        <Button kind="primary" size="lg" disabled={busy} onClick={() => run(() => api.gifts.accept(gift.id))}>
          {busy ? t("accepting") : t("accept")}
        </Button>
        <Button kind="bare" size="sm" disabled={busy} onClick={() => run(() => api.gifts.decline(gift.id))}>
          {t("decline")}
        </Button>
      </div>
    );
  }
  if (gift.direction === "in" && gift.status === "accepted") {
    return gift.thankedAt ? (
      <p className="text-muted">{t("thanked")} ✓</p>
    ) : (
      <Button kind="quiet" size="md" disabled={busy} onClick={() => run(() => api.gifts.thank(gift.id))}>
        {t("thank")}
      </Button>
    );
  }
  if (gift.canCancel) {
    return (
      <Button kind="quiet" size="md" disabled={busy} onClick={() => run(() => api.gifts.cancel(gift.id))}>
        {t("takeBack")}
      </Button>
    );
  }
  if (gift.direction === "out" && gift.thankedAt) return <p className="text-muted">{fill(t("theyThanked"), { name: gift.toName })} ✓</p>;
  return null;
}

/** Shares the treat's link with the phone's share sheet, or copies it. */
export function ShareLink({ gift, t }: { gift: GiftDTO; t: T }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}/hediye/${encodeURIComponent(gift.id)}`;
    const title = fill(t("shareText"), { n: gift.peni });
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · ${gift.cafeName}`, url });
        return;
      }
    } catch {
      return; // closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {}
  };
  return (
    <Button kind="secondary" size="md" onClick={share}>
      {copied ? `${t("copied")} ✓` : t("share")}
    </Button>
  );
}
