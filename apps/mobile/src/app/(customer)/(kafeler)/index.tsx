// Legacy Kafeler list, moved into the (kafeler) tab. Rebuilt with CafeCard in §16 step 6.
import { askiCopy, peniCopy } from "@peni/brand/copy";
import { Link } from "expo-router";
import { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Body, Button, Card, Coin, ErrorText, Label, Row, Screen, Title, useLegacyTheme } from "@/components/legacy-ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

export default function Cafes() {
  const { api, signedIn } = useSession();
  const t = useLegacyTheme();
  const { data, error, loading, refresh } = useLoad(useCallback(() => api.cafes.list(), [api]));

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      {!signedIn && (
        <View style={{ backgroundColor: t.surface2, borderRadius: 10, padding: 12, gap: 8 }}>
          <Body>Kafeye katıl, peni biriktir.</Body>
          <Link href="/giris" asChild>
            <Button title="Giriş yap" variant="ghost" small onPress={() => {}} />
          </Link>
        </View>
      )}
      <ErrorText>{error}</ErrorText>
      {data?.cafes.map((c) => (
        <Link key={c.id} href={`/kafe/${c.slug}`} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={c.name}>
            <Card>
              <Label>{[c.district, c.city].filter(Boolean).join(" · ")}</Label>
              <Title size={22}>{c.name}</Title>
              {c.balancePeni != null && (
                <Row>
                  <Coin />
                  <Body>
                    {peniCopy.balance(c.balancePeni).before}
                    <Body strong style={{ color: t.peniInk }}>
                      {peniCopy.balance(c.balancePeni).amount}
                    </Body>
                  </Body>
                </Row>
              )}
              <Body muted>{askiCopy.cardLine(c.askidaItemsAvailable, null)}</Body>
              <Body strong style={{ color: c.acceptingOrders ? t.leaf : t.ink2 }}>
                {c.acceptingOrders ? "Sipariş alıyor" : "Şu an sipariş almıyor"}
              </Body>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
