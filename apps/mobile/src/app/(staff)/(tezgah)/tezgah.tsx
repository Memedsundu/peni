// Legacy café board ("panel"), moved into the (tezgah) staff tab. Rebuilt per §10.10 in §16 step 6.
import type { OrderDTO } from "@peni/api";
import { askiCopy, staffCopy } from "@peni/brand/copy";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Alert, View } from "react-native";
import { Body, Button, Card, ErrorText, Label, Row, Screen, Title } from "@/components/legacy-ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { setNewOrderCount } from "@/lib/staff-badge";
import { useLoad } from "@/lib/use-load";

type Action = "accept" | "reject" | "ready" | "collect" | "no_show";
const OPEN = ["submitted", "accepted", "ready"] as const;
const TITLES: Record<(typeof OPEN)[number], string> = {
  submitted: staffCopy.columns.new,
  accepted: staffCopy.columns.accepted,
  ready: staffCopy.columns.ready,
};

export default function Tezgah() {
  const { api, staffKey, staffSlug } = useSession();
  const slug = staffSlug;
  const { data, error, refresh } = useLoad(
    useCallback(() => (staffKey && slug ? api.staff.dashboard(slug) : Promise.resolve(null)), [api, staffKey, slug]),
    4000,
  );

  const newCount = data?.orders.filter((o) => o.status === "submitted").length ?? 0;
  const seen = useRef<number | null>(null);
  useEffect(() => {
    setNewOrderCount(newCount);
    if (seen.current != null && newCount > seen.current) haptic("warning");
    seen.current = newCount;
  }, [newCount]);

  if (!staffKey || !slug)
    return (
      <Screen>
        <Body>Tezgâhı açmak için personel anahtarını gir.</Body>
        <Button title="Kafe modu" onPress={() => router.push("/kafe-modu")} />
      </Screen>
    );

  const act = async (o: OrderDTO, action: Action, reason?: string) => {
    try {
      await api.staff.transition(slug, o.id, { action, reason });
      haptic("confirm");
      await refresh();
    } catch (e) {
      haptic("error");
      Alert.alert(staffCopy.reject, (e as Error).message);
    }
  };
  const reject = (o: OrderDTO) =>
    Alert.alert(staffCopy.rejectSheet.title, undefined, [
      { text: "Vazgeç", style: "cancel" },
      ...staffCopy.rejectSheet.reasons.map((r) => ({ text: r, onPress: () => act(o, "reject", r) })),
    ]);

  return (
    <Screen refreshing={false} onRefresh={refresh}>
      {data && <Stack.Screen options={{ title: data.cafe.name }} />}
      <ErrorText>{error}</ErrorText>
      {data && (
        <>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <Body strong>{data.cafe.appOrderingPaused ? staffCopy.ordersPaused : staffCopy.ordersOpen}</Body>
            <Button
              small
              variant={data.cafe.appOrderingPaused ? "primary" : "ghost"}
              title={data.cafe.appOrderingPaused ? staffCopy.resume : "Durdur"}
              onPress={() => api.staff.setPaused(slug, !data.cafe.appOrderingPaused).then(refresh)}
            />
          </Row>
          {OPEN.map((status) => {
            const orders = data.orders.filter((o) => o.status === status);
            return (
              <View key={status} style={{ gap: 8 }}>
                <Label>{staffCopy.segment(TITLES[status], orders.length)}</Label>
                {orders.length === 0 && (
                  <Body muted>{staffCopy.columnEmpty[status === "submitted" ? "new" : status]}</Body>
                )}
                {orders.map((o) => (
                  <Card key={o.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Title size={28}>{o.orderNumber ?? "—"}</Title>
                      <Body muted>{o.customerName}</Body>
                    </Row>
                    {o.lines.map((l, i) => (
                      <Body key={i}>
                        {l.quantity} × {l.name}
                        {l.fromAskida ? ` · ${askiCopy.ticketChip}` : ""}
                        {l.note ? ` · ${l.note}` : ""}
                      </Body>
                    ))}
                    {o.customerNote && <Body muted>{staffCopy.note(o.customerNote)}</Body>}
                    <Body strong>{staffCopy.payment(o.dueKurus)}</Body>
                    <Row style={{ flexWrap: "wrap" }}>
                      {status === "submitted" && (
                        <Button small title={staffCopy.action.submitted} onPress={() => act(o, "accept")} />
                      )}
                      {status === "accepted" && (
                        <Button
                          small
                          variant="leaf"
                          title={staffCopy.action.accepted}
                          onPress={() => act(o, "ready")}
                        />
                      )}
                      {status === "ready" &&
                        (data.cafe.posKind === "standalone" ? (
                          <Button small title={staffCopy.action.ready} onPress={() => act(o, "collect")} />
                        ) : (
                          <Body muted>{staffCopy.action.closesAtTill}</Body>
                        ))}
                      {status === "ready" && (
                        <Button small variant="ghost" title={staffCopy.noShow} onPress={() => act(o, "no_show")} />
                      )}
                      {status !== "ready" && (
                        <Button small variant="berry" title={staffCopy.reject} onPress={() => reject(o)} />
                      )}
                    </Row>
                  </Card>
                ))}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}
