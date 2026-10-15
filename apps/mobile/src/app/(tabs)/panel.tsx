import { formatKurus, formatPeni, type OrderDTO } from "@peni/api";
import { useCallback, useState } from "react";
import { Alert, View } from "react-native";
import { Body, Button, Card, ErrorText, Input, Label, Row, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

type Action = "accept" | "reject" | "ready" | "collect" | "no_show";
const OPEN: OrderDTO["status"][] = ["submitted", "accepted", "ready"];
const TITLES: Record<string, string> = { submitted: "Yeni", accepted: "Hazırlanıyor", ready: "Hazır" };

/** Café mode: a barista runs the "Gelen Siparişler" board from a phone. */
export default function Panel() {
  const { api, staffKey, setStaffKey } = useSession();
  const t = useTheme();
  const [slug, setSlug] = useState("moda");
  const [draft, setDraft] = useState("demo-staff");
  const { data, error, refresh } = useLoad(
    useCallback(() => (staffKey ? api.staff.dashboard(slug) : Promise.resolve(null)), [api, staffKey, slug]),
    4000,
  );

  if (!staffKey)
    return (
      <Screen>
        <Title>Kafe modu</Title>
        <Body muted>Personel anahtarıyla gir. Demo: kafe “moda”, anahtar “demo-staff”.</Body>
        <Input value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="kafe" />
        <Input value={draft} onChangeText={setDraft} autoCapitalize="none" secureTextEntry />
        <Button title="Gir" onPress={() => setStaffKey(draft)} />
      </Screen>
    );

  const act = async (o: OrderDTO, action: Action, reason?: string) => {
    try {
      await api.staff.transition(slug, o.id, { action, reason });
      await refresh();
    } catch (e) {
      Alert.alert("Olmadı", (e as Error).message);
    }
  };
  const reject = (o: OrderDTO) =>
    Alert.alert("Reddet", "Müşteriye görünecek sebep", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Ürün bitti", onPress: () => act(o, "reject", "Bu ürün şu an bitti") },
      { text: "Çok yoğunuz", onPress: () => act(o, "reject", "Şu an çok yoğunuz, kasadan sipariş verebilirsin") },
    ]);

  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <Title>{data.cafe.name}</Title>
            <Button
              small
              variant={data.cafe.appOrderingPaused ? "leaf" : "berry"}
              title={data.cafe.appOrderingPaused ? "Siparişi aç" : "Durdur"}
              onPress={() => api.staff.setPaused(slug, !data.cafe.appOrderingPaused).then(refresh)}
            />
          </Row>
          {OPEN.map((status) => {
            const orders = data.orders.filter((o) => o.status === status);
            return (
              <View key={status} style={{ gap: 8 }}>
                <Label color={t.ink2}>
                  {TITLES[status]} ({orders.length})
                </Label>
                {orders.map((o) => (
                  <Card key={o.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Title size={22}>{o.orderNumber}</Title>
                      <Body muted>{o.customerName}</Body>
                    </Row>
                    {o.lines.map((l, i) => (
                      <Body key={i}>
                        {l.quantity} × {l.name}
                        {l.fromAskida ? "  · askı" : ""}
                        {l.note ? ` · ${l.note}` : ""}
                      </Body>
                    ))}
                    {o.customerNote && <Body muted>“{o.customerNote}”</Body>}
                    <Body>Kasada: {formatKurus(o.dueKurus)}</Body>
                    <Row style={{ flexWrap: "wrap" }}>
                      {status === "submitted" && <Button small title="Kabul et" onPress={() => act(o, "accept")} />}
                      {status === "accepted" && <Button small variant="leaf" title="Hazır" onPress={() => act(o, "ready")} />}
                      {status === "ready" && data.cafe.posKind === "standalone" && (
                        <Button small title="Ödendi" onPress={() => act(o, "collect")} />
                      )}
                      {status === "ready" && <Button small variant="ghost" title="Gelmedi" onPress={() => act(o, "no_show")} />}
                      {status !== "ready" && <Button small variant="berry" title="Reddet" onPress={() => reject(o)} />}
                    </Row>
                  </Card>
                ))}
              </View>
            );
          })}
          <Card>
            <Label>Askı</Label>
            <Body>Askıda {formatPeni(data.askida.balancePeni)} var.</Body>
            <Body muted>Son 30 günde {data.report.askidaClaims} ikram verildi; {formatPeni(data.report.outstandingPeni)} henüz harcanmadı.</Body>
          </Card>
        </>
      )}
      <Button title="Kafe modundan çık" variant="ghost" onPress={() => setStaffKey(null)} />
    </Screen>
  );
}
