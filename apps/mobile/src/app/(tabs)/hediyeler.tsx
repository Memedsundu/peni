import type { FullWalletDTO, GiftDTO } from "@peni/api";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../lib/api";
import { useSession } from "../../lib/session";
import { GiftActions, giftStatus } from "../../ui/gifts";
import { Btn, Label, Loading, Notice, Screen, Title, Txt, useScreenColors } from "../../ui/kit";

/** "Ismarla" (plan piece 12): treats waiting for you, earlier ones, and your Peni kodu per café. */
export default function Treats() {
  const { t, error } = useSession();
  const router = useRouter();
  const c = useScreenColors();
  const [wallet, setWallet] = useState<FullWalletDTO | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.wallet.get().then(setWallet, (e: unknown) => setMessage(error(e))), [error]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // A treat answered here moves from "waiting" to "earlier", and balances change.
  const changed = (gift: GiftDTO) => {
    setWallet((w) => (w ? { ...w, gifts: w.gifts.map((g) => (g.id === gift.id ? gift : g)) } : w));
    void load();
  };

  const waiting = wallet?.gifts.filter((g) => g.direction === "in" && g.status === "pending") ?? [];
  const earlier = wallet?.gifts.filter((g) => !waiting.includes(g)) ?? [];
  return (
    <Screen
      back={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={{ gap: 14 }}>
        <Title>{t("treats")}</Title>
        {wallet && wallet.cafes.length > 0 && (
          <Btn kind="primary" size="lg" onPress={() => router.push("/ismarla")}>
            {t("treatSomeone")}
          </Btn>
        )}
        {wallet && wallet.cafes.length === 0 && <Txt muted>{t("treatNoCafe")}</Txt>}
      </View>
      {message && <Notice tone="red">{message}</Notice>}
      {!wallet && !message && <Loading />}
      {waiting.length > 0 && (
        <View style={{ gap: 12 }}>
          <Label>{t("waitingForYou")}</Label>
          {waiting.map((g) => (
            <View key={g.id} style={{ gap: 16, borderWidth: 1, borderColor: c.line, borderRadius: 22, padding: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt size={18} weight="medium">
                    {g.fromName}
                  </Txt>
                  <Txt size={14} muted>
                    {g.cafeName}
                  </Txt>
                </View>
                <Txt serif size={32}>{`${g.peni} peni`}</Txt>
              </View>
              {g.message ? <Txt serif size={22}>{`“${g.message}”`}</Txt> : null}
              <GiftActions gift={g} onChange={changed} onError={setMessage} />
            </View>
          ))}
        </View>
      )}
      {wallet && (
        <View>
          <Label>{t("earlier")}</Label>
          {earlier.length === 0 && (
            <Txt muted style={{ paddingTop: 8 }}>
              {t("noTreats")}
            </Txt>
          )}
          {earlier.map((g) => (
            <EarlierRow key={g.id} gift={g} onPress={() => router.push(`/hediye/${encodeURIComponent(g.id)}`)} />
          ))}
        </View>
      )}
      {wallet && wallet.cafes.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>{t("yourCode")}</Label>
          <Txt muted>{t("yourCodeHelp")}</Txt>
          {wallet.cafes.map((cafe) => (
            <View key={cafe.cafeSlug} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", backgroundColor: c.panel, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16 }}>
              <Txt>{cafe.cafeName}</Txt>
              <Txt size={20} weight="semibold" style={{ letterSpacing: 2 }}>
                {cafe.memberCode}
              </Txt>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

/** One earlier treat, in or out; its own screen has the note and what can still be done. */
function EarlierRow({ gift, onPress }: { gift: GiftDTO; onPress: () => void }) {
  const { t } = useSession();
  const c = useScreenColors();
  const incoming = gift.direction === "in";
  const counted = gift.status === "accepted" || (!incoming && gift.status === "pending");
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 64, borderBottomWidth: 1, borderColor: c.line, paddingVertical: 10 }, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Txt>
          <Txt muted>{`${incoming ? t("from") : t("to")}: `}</Txt>
          {incoming ? gift.fromName : gift.toName}
        </Txt>
        <Txt size={14} muted>
          {`${gift.cafeName} · ${giftStatus(gift, t)}${gift.thankedAt && !incoming ? " · ♥" : ""}`}
        </Txt>
      </View>
      <Txt size={18} muted={!counted} style={counted ? undefined : { textDecorationLine: "line-through" }}>
        {`${incoming ? "+" : "−"}${gift.peni}`}
      </Txt>
    </Pressable>
  );
}
