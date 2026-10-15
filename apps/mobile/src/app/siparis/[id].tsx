import { fulfillmentLabelsTr, formatKurus } from "@peni/api";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import { Body, Button, Card, ErrorText, Loading, Row, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

const STEPS = ["submitted", "accepted", "ready", "collected"] as const;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const t = useTheme();
  // Push notifications are on the roadmap; until then the screen polls.
  const { data: o, error, refresh } = useLoad(useCallback(() => api.orders.get(id), [api, id]), 3000);

  if (!o) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const step = STEPS.indexOf(o.status as (typeof STEPS)[number]);

  return (
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        <Body muted>{o.cafeName}</Body>
        <Title size={48}>{o.orderNumber}</Title>
        <Body style={{ fontSize: 20, fontWeight: "700", color: o.status === "ready" ? t.leaf : step < 0 ? t.berry : t.ink }}>
          {fulfillmentLabelsTr[o.status]}
        </Body>
        {o.rejectionReason && <Body muted>{o.rejectionReason}</Body>}
        {step >= 0 && (
          <Row style={{ marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= step ? t.copper : t.surface2 }} />
            ))}
          </Row>
        )}
      </Card>
      <Card>
        {o.lines.map((l, i) => (
          <Row key={i} style={{ justifyContent: "space-between" }}>
            <Body>
              {l.quantity} × {l.name}
              {l.fromAskida ? " (askıdan)" : ""}
            </Body>
            <Body>{formatKurus(l.unitPriceKurus * l.quantity)}</Body>
          </Row>
        ))}
        {o.askidaKurus > 0 && <Body style={{ color: t.leaf }}>Askıdan −{formatKurus(o.askidaKurus)}</Body>}
        {o.peniDiscountKurus > 0 && <Body style={{ color: t.copper }}>Peni −{formatKurus(o.peniDiscountKurus)}</Body>}
        <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
          <Body style={{ fontWeight: "700" }}>Kasada ödenecek</Body>
          <Body style={{ fontWeight: "700" }}>{formatKurus(o.dueKurus)}</Body>
        </Row>
      </Card>
      {o.status === "submitted" && (
        <Button title="İptal et" variant="berry" onPress={() => api.orders.cancel(o.id).then(refresh)} />
      )}
    </Screen>
  );
}
