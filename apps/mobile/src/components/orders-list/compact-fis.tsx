/**
 * ŞİMDİ on Siparişler (design-system.md §9.5, §10.4): an active order as a compact fiş — the
 * code in `h2` Brygada, the StatusTrack and the headline. The whole slip is one link to the
 * order. When the order is ready the slip is the Hazır fiş, stamp and all; the stamp only
 * stamps down on the order's own screen (A11), and the Hazır haptic and announcement belong to
 * the active-order pill, so the list never repeats them.
 */
import type { OrderDTO } from "@peni/api";
import { orderCopy } from "@peni/brand/copy";
import { router } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Fis, FisText, HazirStamp, StatusTrack, useFisTokens } from "@/components/brand";
import { orderCode } from "@/components/order/order-model";
import { Icon, PressableScale } from "@/components/ui";
import { radius } from "@/lib/theme";

/** The slip press: .99, like a card. */
const SLIP_PRESS = 0.99;

export const CompactFis = memo(function CompactFis({ order }: { order: OrderDTO }) {
  const ready = order.status === "ready";
  const code = orderCode(order);
  const headline =
    order.status === "submitted"
      ? orderCopy.headline.submitted
      : order.status === "accepted"
        ? orderCopy.headline.accepted
        : orderCopy.headline.ready;
  const readyBody = ready && code ? orderCopy.readyBody(code, order.dueKurus) : null;
  // One short name for the whole slip, instead of every stop of the track read out.
  const label = [`${order.cafeName}, ${code ?? orderCopy.headerTitle}`, headline, readyBody].filter(Boolean).join(" ");

  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Siparişi açar"
      targetScale={SLIP_PRESS}
      onPress={() => router.push({ pathname: "/siparis/[id]", params: { id: order.id } })}
      style={styles.press}
    >
      <Fis
        variant="order"
        tone={ready ? "ready" : "default"}
        legend={orderCopy.legend(order.cafeName)}
        haptics={false}
        announce={null}
      >
        <View style={styles.codeRow}>
          <FisText variant="h2" tabular numberOfLines={1} style={styles.code}>
            {code ?? orderCopy.headerTitle}
          </FisText>
          {ready ? <HazirStamp animate={false} style={styles.stamp} /> : null}
        </View>
        <StatusTrack order={order} style={styles.track} />
        <View style={styles.foot}>
          <View style={styles.footText}>
            <FisText variant="item">{noWidow(headline)}</FisText>
            {readyBody ? <FisText variant="body">{noWidow(readyBody)}</FisText> : null}
          </View>
          <Arrow />
        </View>
      </Fis>
    </PressableScale>
  );
});

/** Keeps the last two words together ("₺145 öde."), so a wrapped line never leaves one word alone. */
function noWidow(text: string): string {
  const i = text.lastIndexOf(" ");
  return i > 0 ? `${text.slice(0, i)}\u00A0${text.slice(i + 1)}` : text;
}

function Arrow() {
  const ft = useFisTokens();
  return (
    <View style={styles.arrow}>
      <Icon icon={ArrowRight} size={20} color={ft.ink2} />
    </View>
  );
}

const styles = StyleSheet.create({
  press: { borderRadius: radius.card },
  codeRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  code: { flexShrink: 1, fontVariant: ["lining-nums", "tabular-nums"] },
  stamp: { marginRight: 2 },
  track: { marginTop: 16 },
  foot: { marginTop: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  footText: { flex: 1, minWidth: 0, gap: 2 },
  arrow: { paddingBottom: 1 },
});
