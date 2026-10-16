/**
 * Siparişler (design-system.md §10.4, with §9.5 for anatomy and copy).
 *
 * - The large title "Siparişler".
 * - "ŞİMDİ": active orders as compact fişes (code, StatusTrack, headline), each a link to its
 *   order. "GEÇMİŞ": one raised card of rows grouped by day, with status chips and, on the most
 *   recent collected order per café, "Her zamanki: …", which opens the café with `?sepet=`.
 * - Loading: two skeleton rows. Empty: "Henüz siparişin yok. Bir kafe seç, ilk siparişini
 *   ver." + "Kafelere bak". Signed out: "Siparişlerini görmek için giriş yap." + "Giriş yap".
 * - A failed refresh keeps the list and says so at the top with "Tekrar dene".
 */
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { ReceiptText } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { TabScreen } from "@/components/home/tab-screen";
import { CompactFis } from "@/components/orders-list/compact-fis";
import { splitOrders } from "@/components/orders-list/model";
import { OrderHistory, OrderHistorySkeleton } from "@/components/orders-list/order-history";
import { useOrders } from "@/components/orders-list/use-orders";
import { withoutRetry } from "@/components/order/use-order";
import { Banner, Button, EmptyState, Skeleton, T } from "@/components/ui";
import { useSession } from "@/lib/session";

const TITLE = "Siparişler";
const LEGEND_NOW = "ŞİMDİ";
const LEGEND_PAST = "GEÇMİŞ";
// No-break spaces keep the last words together when the sentence wraps.
const EMPTY = "Henüz siparişin yok. Bir kafe seç, ilk siparişini\u00A0ver.";
const SIGNED_OUT = "Siparişlerini görmek için giriş\u00A0yap.";

export default function Siparisler() {
  const { api, signedIn } = useSession();
  const { orders, load, error, readAt, refresh } = useOrders(api, signedIn);
  const [retrying, setRetrying] = useState(false);
  const { active, past } = useMemo(() => splitOrders(orders ?? []), [orders]);

  if (load === "signed_out") {
    return (
      <TabScreen title={TITLE} centered>
        <EmptyState
          icon={ReceiptText}
          text={SIGNED_OUT}
          action={{ label: actionCopy.signIn, onPress: () => router.push("/giris") }}
        />
      </TabScreen>
    );
  }

  const retry = async () => {
    setRetrying(true);
    await refresh();
    setRetrying(false);
  };
  const banner = error ? (
    <Banner
      tone="danger"
      title={withoutRetry(error)}
      action={
        <Button
          size="sm"
          variant="secondary"
          title={errorCopy.retry}
          loading={retrying}
          loadingLabel={errorCopy.retry}
          onPress={() => void retry()}
        />
      }
    />
  ) : null;

  if (!orders) {
    return (
      <TabScreen title={TITLE} onRefresh={refresh} busy={load === "loading"}>
        {banner}
        {load === "loading" ? (
          <View style={styles.section}>
            <Skeleton width={56} line="legend" />
            <OrderHistorySkeleton />
          </View>
        ) : null}
      </TabScreen>
    );
  }

  if (orders.length === 0) {
    return (
      <TabScreen title={TITLE} onRefresh={refresh} centered top={banner}>
        <EmptyState
          icon={ReceiptText}
          text={EMPTY}
          action={{ label: actionCopy.browseCafes, onPress: () => router.navigate("/") }}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen title={TITLE} onRefresh={refresh} gap={32}>
      {banner}
      {active.length > 0 ? (
        <View style={styles.section}>
          <T variant="legend" color="ink2" accessibilityRole="header">
            {LEGEND_NOW}
          </T>
          <View style={styles.slips}>
            {active.map((o) => (
              <CompactFis key={o.id} order={o} />
            ))}
          </View>
        </View>
      ) : null}
      {past.length > 0 ? (
        <View style={styles.section}>
          <T variant="legend" color="ink2" accessibilityRole="header">
            {LEGEND_PAST}
          </T>
          <OrderHistory orders={past} now={readAt} />
        </View>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  slips: { gap: 20 },
});
