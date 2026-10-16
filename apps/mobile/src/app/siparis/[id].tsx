/**
 * Sipariş (design-system.md §10.3; content and copy as web §9.4). Root stack, header "Sipariş".
 *
 * - The fiş full width in the 16pt gutter (`OrderFis`), the actions under it: "Kafeye dön"
 *   (`router.dismissTo` the café, or the café replaces this screen when it isn't below), and
 *   while `submitted` only, the quiet danger "İptal et" → the `iptal` sheet (D16).
 *   Rejected: primary "Yeniden sipariş ver" (the café with `?sepet=`) and secondary "Kafeye dön".
 * - Polls every 4s while focused and the app is active; stops at a terminal status (`useOrder`).
 *   A failed poll never wipes the fiş; two in a row put a banner at the top.
 * - Moments: Hazır (A11: the Fis plays `success` and announces; the stamp comes down only
 *   live), peni earned (A6: coin strike + CountWheel + `success`, once per order), rejected
 *   (`warning` haptic). On iOS every other new headline is announced (Android's live region
 *   reads it by itself).
 * - States: skeleton fiş, not found, signed out, first-load error with "Tekrar dene".
 */
import type { FulfillmentStatus } from "@peni/api";
import { actionCopy, errorCopy, orderCopy } from "@peni/brand/copy";
import { router, useLocalSearchParams } from "expo-router";
import { ReceiptText } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  earnedPeni,
  headline,
  OrderFis,
  OrderFisSkeleton,
  POLL_FAILURES_SHOWN,
  reorderSepet,
  useEarnMoment,
  useOrder,
  withoutRetry,
} from "@/components/order";
import { Banner, Button, EmptyState } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { space, useTokens } from "@/lib/theme";

/** §9.4 has no line for this; the web fiş says the same. */
const SIGNED_OUT = "Bu siparişi görmek için giriş yap.";

type PrepRange = { low: number; high: number } | null;

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const { order, load, error, failures, refresh } = useOrder(id);
  const [now] = useState(() => new Date());

  /* ------------------------------------------------ the café's usual prep time [G14] */

  // Read once, only while it can matter (before Hazır). No data: no ETA, ever.
  const [prepRange, setPrepRange] = useState<PrepRange>(null);
  const prepFor = useRef<string | null>(null);
  const slug = order?.cafeSlug ?? null;
  const early = order?.status === "submitted" || order?.status === "accepted";
  useEffect(() => {
    if (!slug || !early || prepFor.current === slug) return;
    prepFor.current = slug;
    api.cafes
      .get(slug)
      .then((cafe) => setPrepRange(cafe.medianPrepMinutes != null ? cafe.prepMinutesRange : null))
      .catch(() => {});
  }, [api, slug, early]);

  /* ------------------------------------------------ what changed while looking (A6, A11) */

  const lastStatus = useRef<FulfillmentStatus | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [liveCollected, setLiveCollected] = useState(false);
  useEffect(() => {
    if (!order) return;
    const prev = lastStatus.current;
    lastStatus.current = order.status;
    if (prev === null || prev === order.status) return;
    if (order.status === "ready") setLiveReady(true);
    if (order.status === "collected") setLiveCollected(true);
    if (order.status === "rejected") haptic("warning");
    // Hazır is announced by the Fis; VoiceOver has no live regions, so say the rest here.
    if (Platform.OS === "ios" && order.status !== "ready") {
      AccessibilityInfo.announceForAccessibility(headline(order, prepRange));
    }
  }, [order?.status]);

  const earnMode = useEarnMoment(order?.id ?? null, order ? earnedPeni(order) : null, liveCollected);

  /* ------------------------------------------------ pull to refresh */

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    haptic("selection");
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }, [refresh]);

  /* ------------------------------------------------ layout */

  const scroll = (children: React.ReactNode, centered = false) => (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }, centered ? styles.centered : null]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={t.ink}
          colors={[t.ink]}
          progressBackgroundColor={t.surface}
        />
      }
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );

  if (load === "not_found") {
    return scroll(
      <EmptyState
        icon={ReceiptText}
        text={orderCopy.notFound}
        action={{ label: orderCopy.notFoundAction, onPress: () => router.dismissTo("/siparisler") }}
      />,
      true,
    );
  }

  if (load === "signed_out") {
    return scroll(
      <EmptyState icon={ReceiptText} text={SIGNED_OUT} action={{ label: actionCopy.signIn, onPress: () => router.push("/giris") }} />,
      true,
    );
  }

  if (!order) {
    return scroll(
      <>
        {load === "error" && error ? (
          <Banner
            tone="danger"
            title={withoutRetry(error)}
            style={styles.banner}
            action={<Button size="sm" variant="secondary" title={errorCopy.retry} loading={retrying} loadingLabel={errorCopy.retry} onPress={() => void retry()} />}
          />
        ) : null}
        <OrderFisSkeleton />
      </>,
    );
  }

  const rejected = order.status === "rejected";
  const backToCafe = () => router.dismissTo({ pathname: "/kafe/[slug]", params: { slug: order.cafeSlug } });
  const reorder = () => {
    const sepet = reorderSepet(order.lines);
    router.dismissTo({ pathname: "/kafe/[slug]", params: sepet ? { slug: order.cafeSlug, sepet } : { slug: order.cafeSlug } });
  };

  return scroll(
    <>
      {/* Two missed polls in a row: say so at the top, keep the fiş as it was. */}
      {failures >= POLL_FAILURES_SHOWN && error ? (
        <Banner
          tone="danger"
          title={withoutRetry(error)}
          style={styles.banner}
          action={<Button size="sm" variant="secondary" title={errorCopy.retry} loading={retrying} loadingLabel={errorCopy.retry} onPress={() => void retry()} />}
        />
      ) : null}

      <OrderFis order={order} prepRange={prepRange} stampAnimates={liveReady} earnMode={earnMode} now={now} />

      <View style={styles.actions}>
        {rejected ? (
          <>
            <Button title={orderCopy.reorder} fullWidth onPress={reorder} />
            <Button title={orderCopy.backToCafe} variant="secondary" fullWidth onPress={backToCafe} />
          </>
        ) : (
          <Button title={orderCopy.backToCafe} fullWidth onPress={backToCafe} />
        )}
        {order.status === "submitted" ? (
          <Button
            title={orderCopy.cancel}
            variant="danger-quiet"
            style={styles.cancel}
            onPress={() => router.push({ pathname: "/iptal", params: { id: order.id } })}
          />
        ) : null}
      </View>
    </>,
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: 12 },
  centered: { justifyContent: "center" },
  // Phones are narrower than this; it keeps the slip a slip in the wide browser preview (§5: 440).
  column: { width: "100%", maxWidth: 440, alignSelf: "center" },
  banner: { marginBottom: 16 },
  actions: { marginTop: 24, gap: 8 },
  cancel: { alignSelf: "center", minWidth: 160 },
});
