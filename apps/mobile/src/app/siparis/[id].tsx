// Legacy order screen. Rebuilt as the fiş (§6.3, §10.3) in §16 step 6.
import { orderCopy, statusTrackIndex, statusTrackStops, statusWords, terminalStatuses } from "@peni/brand/copy";
import { formatTL } from "@peni/brand/format";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, View } from "react-native";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Label,
  Loading,
  Row,
  Screen,
  Title,
  useLegacyTheme,
} from "@/components/legacy-ui";
import { refreshActiveOrder } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { useLoad } from "@/lib/use-load";

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSession();
  const t = useLegacyTheme();
  // Push notifications are on the roadmap; until then the screen polls while focused.
  const { data: o, error } = useLoad(
    useCallback(() => api.orders.get(id), [api, id]),
    4000,
  );

  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!o) return;
    if (lastStatus.current && lastStatus.current !== o.status) {
      void refreshActiveOrder();
      if (o.status === "ready") {
        haptic("success");
        AccessibilityInfo.announceForAccessibility(orderCopy.readyAnnouncement(o.orderNumber ?? ""));
      } else if (o.status === "rejected") haptic("warning");
    }
    lastStatus.current = o.status;
  }, [o]);

  if (!o)
    return error ? (
      <Screen>
        <ErrorText>{error}</ErrorText>
      </Screen>
    ) : (
      <Loading />
    );
  // The track stops where a rejected, cancelled or uncollected order ended; hide it for those.
  const step = o.status === "collected" || !terminalStatuses.includes(o.status) ? statusTrackIndex(o.status) : -1;
  const ready = o.status === "ready";

  return (
    <Screen>
      <Card style={{ alignItems: "center", paddingVertical: 24, backgroundColor: ready ? t.success : t.surface }}>
        <Label color={ready ? t.onSuccess2 : t.ink2}>{orderCopy.legend(o.cafeName)}</Label>
        <Title size={56}>{o.orderNumber ?? "—"}</Title>
        <Body strong style={{ color: ready ? t.onSuccess : t.ink, textAlign: "center" }}>
          {orderCopy.headline[o.status]}
        </Body>
        {ready && (
          <Body style={{ color: t.onSuccess, textAlign: "center" }}>
            {orderCopy.readyBody(o.orderNumber ?? "", o.dueKurus)}
          </Body>
        )}
        {o.rejectionReason && <Body muted>{orderCopy.rejectedNote(o.rejectionReason)}</Body>}
        {step >= 0 && (
          <View style={{ alignSelf: "stretch", gap: 6, marginTop: 12 }}>
            <Row>
              {statusTrackStops.map((s, i) => (
                <View
                  key={s}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: i <= step ? (ready ? t.onSuccess : t.ink) : t.lineStrong,
                  }}
                />
              ))}
            </Row>
            <Body muted style={ready ? { color: t.onSuccess2 } : undefined}>
              {statusWords[o.status]}
            </Body>
          </View>
        )}
      </Card>
      <Card>
        {o.lines.map((l, i) => (
          <Row key={i} style={{ justifyContent: "space-between" }}>
            <Body>
              {l.quantity} × {l.name}
            </Body>
            <Body>{formatTL(l.unitPriceKurus * l.quantity)}</Body>
          </Row>
        ))}
        {o.askidaKurus > 0 && (
          <Row style={{ justifyContent: "space-between" }}>
            <Body>{orderCopy.askiLine}</Body>
            <Body>−{formatTL(o.askidaKurus)}</Body>
          </Row>
        )}
        {o.peniDiscountKurus > 0 && (
          <Row style={{ justifyContent: "space-between" }}>
            <Body>{orderCopy.peniLine}</Body>
            <Body>−{formatTL(o.peniDiscountKurus)}</Body>
          </Row>
        )}
        <Row style={{ justifyContent: "space-between", borderTopWidth: 1, borderTopColor: t.line, paddingTop: 8 }}>
          <Body strong>{o.dueKurus > 0 ? orderCopy.dueLabel : orderCopy.noPayment}</Body>
          {o.dueKurus > 0 && <Body strong>{formatTL(o.dueKurus)}</Body>}
        </Row>
      </Card>
      <Button title={orderCopy.backToCafe} variant="ghost" onPress={() => router.dismissTo(`/kafe/${o.cafeSlug}`)} />
      {o.status === "submitted" && (
        <Button
          title={orderCopy.cancel}
          variant="berry"
          onPress={() => router.push({ pathname: "/iptal", params: { id: o.id } })}
        />
      )}
    </Screen>
  );
}
