// Legacy Siparişler list, moved into the (siparisler) tab. Rebuilt per §10.4 in §16 step 6.
import { statusWords } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { Link } from "expo-router";
import { useCallback } from "react";
import { Pressable } from "react-native";
import { Body, Button, Card, ErrorText, Row, Screen, Title } from "@/components/legacy-ui";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

export default function Orders() {
  const { api, signedIn } = useSession();
  const { data, error, loading, refresh } = useLoad(
    useCallback(() => (signedIn ? api.orders.mine() : Promise.resolve({ orders: [] })), [api, signedIn]),
    10_000,
  );

  if (!signedIn)
    return (
      <Screen>
        <Body>Siparişlerini görmek için giriş yap.</Body>
        <Link href="/giris" asChild>
          <Button title="Giriş yap" onPress={() => {}} />
        </Link>
      </Screen>
    );

  return (
    <Screen refreshing={loading} onRefresh={refresh}>
      <ErrorText>{error}</ErrorText>
      {data?.orders.length === 0 && <Body muted>Henüz siparişin yok.</Body>}
      {data?.orders.map((o) => (
        <Link key={o.id} href={`/siparis/${o.id}`} asChild>
          <Pressable accessibilityRole="link">
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <Title size={22}>{o.orderNumber ?? "Sipariş"}</Title>
                <Body strong>{statusWords[o.status]}</Body>
              </Row>
              <Body muted>
                {o.cafeName} · {o.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")} · {formatTL(o.dueKurus)}
              </Body>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
