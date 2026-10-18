import type { GiftDTO } from "@peni/api";
import { fill, type Lang, type T } from "@peni/api/customer-text";
import { useState } from "react";
import { Share, View } from "react-native";
import { api, PUBLIC_URL } from "../lib/api";
import { useSession } from "../lib/session";
import { Btn, Txt } from "./kit";

/** One line on where a treat stands, from the viewer's side. */
export function giftStatus(gift: GiftDTO, t: T): string {
  if (gift.direction === "in") {
    return { pending: t("inPending"), accepted: t("inAccepted"), declined: t("inDeclined"), expired: t("inExpired") }[gift.status];
  }
  if (gift.status === "declined") return gift.cancelledBySender ? t("outCancelled") : t("outDeclined");
  return { pending: t("outPending"), accepted: t("outAccepted"), expired: t("outExpired") }[gift.status];
}

/** "Son kabul: Cmt 14:20", in the phone's own time. */
export function acceptBy(gift: GiftDTO, lang: Lang): string {
  return new Date(gift.expiresAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * What the viewer can do with a treat: accept or decline one waiting for them, say thanks
 * once it's theirs, or take back one they sent that nobody accepted yet.
 */
export function GiftActions({ gift, onChange, onError }: { gift: GiftDTO; onChange: (g: GiftDTO) => void; onError: (message: string | null) => void }) {
  const { t, error } = useSession();
  const [busy, setBusy] = useState(false);
  const run = (call: () => Promise<GiftDTO>) => {
    setBusy(true);
    onError(null);
    call()
      .then(onChange, (e: unknown) => onError(error(e)))
      .finally(() => setBusy(false));
  };

  if (gift.direction === "in" && gift.status === "pending") {
    return (
      <View style={{ gap: 6 }}>
        <Btn kind="primary" size="lg" busy={busy} onPress={() => run(() => api.gifts.accept(gift.id))}>
          {t("accept")}
        </Btn>
        <Btn kind="bare" size="sm" disabled={busy} onPress={() => run(() => api.gifts.decline(gift.id))}>
          {t("decline")}
        </Btn>
      </View>
    );
  }
  if (gift.direction === "in" && gift.status === "accepted") {
    return gift.thankedAt ? (
      <Txt muted>{`${t("thanked")} ✓`}</Txt>
    ) : (
      <Btn kind="quiet" size="md" busy={busy} onPress={() => run(() => api.gifts.thank(gift.id))}>
        {t("thank")}
      </Btn>
    );
  }
  if (gift.canCancel) {
    return (
      <Btn kind="quiet" size="md" busy={busy} onPress={() => run(() => api.gifts.cancel(gift.id))}>
        {t("takeBack")}
      </Btn>
    );
  }
  if (gift.direction === "out" && gift.thankedAt) return <Txt muted>{`${fill(t("theyThanked"), { name: gift.toName })} ✓`}</Txt>;
  return null;
}

/** The phone's share sheet with the treat's web link, which opens for anyone. */
export function ShareLink({ gift }: { gift: GiftDTO }) {
  const { t } = useSession();
  const share = async () => {
    const url = `${PUBLIC_URL}/hediye/${encodeURIComponent(gift.id)}`;
    const title = fill(t("shareText"), { n: gift.peni });
    try {
      await Share.share({ title, message: `${title} · ${gift.cafeName}\n${url}`, url });
    } catch {
      // closed the share sheet, or none on this device
    }
  };
  return (
    <Btn kind="secondary" size="md" onPress={() => void share()}>
      {t("share")}
    </Btn>
  );
}
