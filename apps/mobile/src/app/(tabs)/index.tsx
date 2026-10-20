import type { CafeSummaryDTO } from "@peni/api";
import { fill } from "@peni/api/customer-text";
import { goods } from "@peni/brand/format";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../lib/api";
import { when } from "../../lib/dates";
import { useSession } from "../../lib/session";
import { Btn, Coin, Hue, Label, Loading, Notice, Photo, Row, Screen, Title, Txt, useScreenColors } from "../../ui/kit";

/** "Kafelerim" (design): the cafés the customer belongs to, each with its peni, then the others. */
export default function MyCafes() {
  const { t, error } = useSession();
  const router = useRouter();
  const [cafes, setCafes] = useState<CafeSummaryDTO[] | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, wallet] = await Promise.all([api.cafes.list(), api.wallet.get()]);
      setCafes(list.cafes);
      setWaiting(wallet.gifts.filter((g) => g.direction === "in" && g.status === "pending").length);
      setMessage(null);
    } catch (e) {
      setMessage(error(e));
    }
  }, [error]);
  // Back from a café or a code, the balances may have moved.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mine = cafes?.filter((c) => c.isMember) ?? [];
  const others = cafes?.filter((c) => !c.isMember) ?? [];
  const total = mine.reduce((sum, c) => sum + (c.balancePeni ?? 0), 0);
  return (
    <Screen
      back={false}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load().finally(() => setRefreshing(false));
      }}
    >
      <View style={{ gap: 6 }}>
        <Title>{t("tabCafes")}</Title>
        {mine.length > 0 && <Txt muted>{fill(t("totalPeni"), { n: total })}</Txt>}
      </View>
      {message && <Notice tone="red">{message}</Notice>}
      {!cafes && !message && <Loading />}
      {waiting > 0 && (
        <Row onPress={() => router.push("/hediyeler")}>
          <Txt weight="medium">{t("waitingForYou")}</Txt>
          <Txt weight="semibold">{waiting}</Txt>
        </Row>
      )}
      {cafes && mine.length === 0 && (
        <View style={{ gap: 14 }}>
          <Txt size={18}>{t("noCafesYet")}</Txt>
          <Btn kind="primary" size="lg" onPress={() => router.push("/p")}>
            {t("scanQr")}
          </Btn>
        </View>
      )}
      {mine.map((cafe) => (
        <Hue key={cafe.slug} hue={cafe.hue}>
          <CafeCard cafe={cafe} onPress={() => router.push(`/kafe/${encodeURIComponent(cafe.slug)}`)} />
        </Hue>
      ))}
      {others.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>{t("otherCafes")}</Label>
          {others.map((cafe) => (
            <Row key={cafe.slug} onPress={() => router.push(`/kafe/${encodeURIComponent(cafe.slug)}`)}>
              <View style={{ flex: 1 }}>
                <Txt size={18}>{cafe.name}</Txt>
                {cafe.district ? (
                  <Txt size={14} muted>
                    {cafe.district}
                  </Txt>
                ) : null}
              </View>
              <Txt muted>→</Txt>
            </Row>
          ))}
        </View>
      )}
    </Screen>
  );
}

/** One café: its photo, its name, the peni here read as goods, and what's next at its table. */
function CafeCard({ cafe, onPress }: { cafe: CafeSummaryDTO; onPress: () => void }) {
  const { t, lang } = useSession();
  const c = useScreenColors();
  const peni = cafe.balancePeni ?? 0;
  const asGoods = goods(peni, cafe.refItems);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${cafe.name}, ${peni} penny`} style={({ pressed }) => [{ gap: 14 }, pressed && { opacity: 0.8 }]}>
      <Photo url={cafe.coverImageUrl} label={cafe.name} aspect={2} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt serif size={32}>
            {cafe.name}
          </Txt>
          {cafe.district ? <Txt muted>{cafe.district}</Txt> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Coin size={36} />
            <Txt serif size={44} color={c.cafe}>
              {peni} <Txt serif size={22} color={c.cafe}>penny</Txt>
            </Txt>
          </View>
          {asGoods ? (
            <Txt size={14} muted>
              {asGoods}
            </Txt>
          ) : null}
        </View>
      </View>
      {cafe.nextEvent && (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", borderTopWidth: 1, borderColor: c.line, paddingTop: 12 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.cafe }} />
          <View style={{ flex: 1 }}>
            <Txt size={15} numberOfLines={1}>
              {fill(t("nextUp"), { title: cafe.nextEvent.title })}
            </Txt>
          </View>
          <Txt size={14} muted>
            {when(cafe.nextEvent.startsAt, lang)}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}
