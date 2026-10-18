import type { GiftDTO, GiftPreviewDTO } from "@peni/api";
import { fill } from "@peni/api/customer-text";
import { dativeName } from "@peni/brand/format";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { acceptBy, GiftActions, giftStatus, ShareLink } from "../../ui/gifts";
import { Amount, Btn, CafeLine, Loading, Notice, Screen, Title, Txt, useScreenColors } from "../../ui/kit";
import { SignIn } from "../../ui/sign-in";

/**
 * A treat (plan piece 12), as its link opens it: anyone sees who treated and how much; only
 * the recipient can accept it, and only the sender sees the note and can take it back.
 */
export default function GiftScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, t } = useSession();
  const [preview, setPreview] = useState<GiftPreviewDTO | null>(null);
  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => api.gifts.preview(id).then(setPreview, () => setMissing(true)), [id]);
  useEffect(() => {
    void load();
  }, [load, me]);
  const changed = (gift: GiftDTO) => setPreview((p) => (p ? { ...p, status: gift.status, gift } : p));

  let body;
  if (missing) body = <Title>{t("treatNotFound")}</Title>;
  else if (!preview) body = <Loading />;
  else if (preview.gift) body = <Mine preview={preview} gift={preview.gift} onChange={changed} onError={setMessage} />;
  else
    body = (
      <View style={{ gap: 22 }}>
        <CafeLine name={preview.cafeName} />
        <Title>{fill(t("treatedSomeone"), { name: preview.fromFirstName })}</Title>
        <Amount peni={preview.peni} goods={preview.goods} caption={preview.status === "pending" ? t("outPending") : t("treatGone")} />
        {preview.viewer === "signed_out" ? preview.status === "pending" && <SignIn prompt={t("ifForYou")} /> : <Txt size={18}>{t("notForYou")}</Txt>}
      </View>
    );
  return (
    <Screen hue={preview?.hue ?? null}>
      {body}
      {message && <Notice tone="red">{message}</Notice>}
    </Screen>
  );
}

/** The recipient's or the sender's view: the note, where it stands, and what they can do. */
function Mine({ preview, gift, onChange, onError }: { preview: GiftPreviewDTO; gift: GiftDTO; onChange: (g: GiftDTO) => void; onError: (m: string | null) => void }) {
  const { t, lang } = useSession();
  const c = useScreenColors();
  const router = useRouter();
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
    <View style={{ gap: 22 }} accessibilityLiveRegion="polite">
      <CafeLine name={gift.cafeName} />
      <Title>{title}</Title>
      <Amount peni={gift.peni} goods={preview.goods} caption={caption} />
      {gift.message ? (
        <View style={{ borderLeftWidth: 2, borderColor: c.cafe, paddingLeft: 16 }}>
          <Txt serif size={26}>
            {gift.message}
          </Txt>
        </View>
      ) : null}
      <GiftActions gift={gift} onChange={onChange} onError={onError} />
      {!incoming && gift.status === "pending" && (
        <View style={{ gap: 10 }}>
          <Txt muted>{t("shareHelp")}</Txt>
          <ShareLink gift={gift} />
        </View>
      )}
      {incoming && gift.status === "accepted" && (
        <View style={{ gap: 10 }}>
          <Txt muted>{t("spendHint")}</Txt>
          <Btn kind="secondary" onPress={() => router.push(`/harca?kafe=${encodeURIComponent(gift.cafeSlug)}`)}>
            {t("mySpendCode")}
          </Btn>
        </View>
      )}
    </View>
  );
}
