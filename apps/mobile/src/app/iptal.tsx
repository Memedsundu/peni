/**
 * `iptal` sheet (design-system.md §9.4, §10.3, D16): the cancel confirm, opened from the fiş
 * with `?id=<orderId>` and only while the order is `submitted`, so a double tap can never
 * cancel. A native form sheet with `fitToContents` (its content has natural heights, never
 * `flex: 1`); the title lives in the content, because Android has no header in a sheet.
 *
 * - "Siparişi iptal edelim mi?" + "Barista henüz başlamadı; iptal edersen kullandığın peni
 *   cüzdanına döner." Buttons: quiet danger "İptal et" and primary "Vazgeç".
 * - Errors stay inline in the sheet (a danger Banner over the buttons), the order is re-read,
 *   and nothing else on the fiş changes.
 * - If the barista accepts while the sheet is open, there is nothing left to cancel: the sheet
 *   says so and offers only "Tamam".
 * - Success: the cancelled order goes into the shared cache and the sheet closes; the fiş
 *   already reads "İptal edildi." No toast (§17).
 */
import { actionCopy, errorCopy, orderCopy } from "@peni/brand/copy";
import { SEP } from "@peni/brand/format";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { errorMessage, orderCode, putOrder, useCachedOrder } from "@/components/order";
import { Banner, Button, ButtonRow, T } from "@/components/ui";
import { refreshActiveOrder } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { useTokens } from "@/lib/theme";

/** The barista moved first (the web sheet says the same). */
const TOO_LATE = "Barista siparişini hazırlamaya başladı; artık iptal edilemez.";
/** While the request is in flight (the spinner's words). */
const CANCELLING = "İptal ediliyor…";

export default function IptalSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { api } = useSession();
  const order = useCachedOrder(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = orderCopy.cancelSheet;

  // Read the order as the sheet opens: the barista may have just accepted it.
  useEffect(() => {
    if (id) api.orders.get(id).then(putOrder, () => {});
  }, [api, id]);

  // Cancelled (by this sheet or elsewhere): the job is done, close.
  const closed = useRef(false);
  useEffect(() => {
    if (order?.status === "cancelled" && !closed.current) {
      closed.current = true;
      router.back();
    }
  }, [order?.status]);

  const tooLate = order != null && order.status !== "submitted" && order.status !== "cancelled";
  const code = order ? orderCode(order) : null;
  const legend = order ? [code, order.cafeName].filter(Boolean).join(SEP) : null;

  const confirm = async () => {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const cancelled = await api.orders.cancel(id);
      haptic("confirm");
      putOrder(cancelled); // closes the sheet (above) and turns the fiş
      void refreshActiveOrder();
    } catch (e) {
      haptic("error");
      setError(errorMessage(e));
      // If it was too late, the re-read turns the sheet into "artık iptal edilemez".
      api.orders.get(id).then(putOrder, () => {});
      setBusy(false);
    }
  };

  return (
    <View style={[styles.sheet, { backgroundColor: t.surface, paddingBottom: 16 + insets.bottom }]}>
      {/* No swipe-to-dismiss while the request is in flight. */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />

      <View style={styles.head}>
        {legend ? (
          <T variant="plate" color="ink2">
            {legend}
          </T>
        ) : null}
        <T variant="h3">{c.title}</T>
        {tooLate || !id ? null : (
          <T variant="body" color="ink2">
            {c.body}
          </T>
        )}
      </View>

      {!id ? (
        <Banner tone="danger" title={errorCopy.orderNotFound} />
      ) : tooLate ? (
        <Banner tone="info" title={TOO_LATE} />
      ) : error ? (
        <Banner tone="danger" title={error} />
      ) : null}

      {tooLate || !id ? (
        <Button title={actionCopy.ok} fullWidth onPress={() => router.back()} />
      ) : (
        <ButtonRow>
          <Button
            title={c.confirm}
            variant="danger-quiet"
            fullWidth
            loading={busy}
            loadingLabel={CANCELLING}
            onPress={() => void confirm()}
          />
          <Button title={c.keep} fullWidth disabled={busy} onPress={() => router.back()} />
        </ButtonRow>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: 20, paddingTop: 28, gap: 20 },
  head: { gap: 8 },
});
