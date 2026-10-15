import { Link } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Coin, ErrorText, Row, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Cafes() {
  const { api, signedIn } = useSession();
  const t = useTheme();
  const { data, error, loading, refresh } = useLoad(useCallback(() => api.cafes.list(), [api]));

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <View style={{ gap: 6 }}>
        <Title size={32}>Bir peniye, aynı masada.</Title>
        <Body muted>
          Siparişini önceden ver, harcadıkça peni biriktir, bir komşuna ısmarla ya da askıya kahve bırak.
        </Body>
      </View>
      {!signedIn && (
        <Link href="/giris" asChild>
          <Button title="Telefonla giriş yap" onPress={() => {}} />
        </Link>
      )}
      <ErrorText>{error}</ErrorText>
      {data?.cafes.map((c) => (
        <Link key={c.id} href={`/kafe/${c.slug}`} asChild>
          <Pressable>
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <Title size={20}>{c.name}</Title>
                <Body style={{ fontSize: 12, fontWeight: "700", color: c.acceptingOrders ? t.leaf : t.ink2 }}>
                  {c.acceptingOrders ? "Sipariş alıyor" : "Kapalı"}
                </Body>
              </Row>
              <Body muted>{[c.district, c.city].filter(Boolean).join(", ")}</Body>
              <Row>
                <Coin />
                <Body>{c.askidaItemsAvailable > 0 ? `Askıda ${c.askidaItemsAvailable} ikram bekliyor` : "Askı şu an boş"}</Body>
              </Row>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
