/**
 * The active order indicator (design-system.md §8.4 "Active order"): "P-003 · Hazırlanıyor"
 * with a 20pt progress ring, linking to the fiş.
 *
 * - iOS 26: `ActiveOrderAccessory`, the content of `NativeTabs.BottomAccessory`. The system
 *   renders it twice (regular and inline), so it keeps no state; it branches on
 *   `usePlacement()`.
 * - Android, iOS < 26 and the browser preview: `ActiveOrderPill`, floating 8pt above the tab
 *   bar on tab screens only (`FloatingActiveOrderPill` places it). Root-stack screens (café,
 *   fiş) cover the tabs, so it is never a second floating layer there (D10).
 *
 * The ring shows the stage the barista has reached (a quarter per stop), never time. At Hazır
 * the pill turns `success` with `onSuccess` text (like the web chip) and, if the tabs are on
 * screen, says "P-003 · Hazır" and plays `success` once.
 */
import type { OrderDTO } from "@peni/api";
import { statusTrackIndex } from "@peni/brand/copy";
import { router, useIsFocused } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { ChevronRight } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Keyboard, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale, T, withAlpha } from "@/components/ui";
import { useActiveOrder } from "@/lib/active-order";
import { haptic } from "@/lib/haptics";
import { durations } from "@/lib/motion";
import { elevation, fonts, isDark, radius, useTokens, type Tokens } from "@/lib/theme";
import { chipLabel, orderCode } from "./order-model";

/* ------------------------------------------------------------------------------------------ */
/* Ring                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const RING = 20;
const RING_STROKE = 2;

/** The stage as a ring: a quarter per stop reached (İletildi ¼ · Hazırlanıyor ½ · Hazır ¾). */
export const ProgressRing = memo(function ProgressRing({ status, track, fill }: { status: OrderDTO["status"]; track: string; fill: string }) {
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const progress = (statusTrackIndex(status) + 1) / 4;
  return (
    <View aria-hidden accessible={false} pointerEvents="none" style={styles.ring}>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={fill}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * progress} ${c}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
    </View>
  );
});

function openOrder(order: OrderDTO) {
  router.push(`/siparis/${order.id}`);
}

/** "Siparişi aç" for screen readers; the label carries the state. */
const HINT = "Siparişi açar";

/* ------------------------------------------------------------------------------------------ */
/* The floating pill                                                                           */
/* ------------------------------------------------------------------------------------------ */

export const PILL_HEIGHT = 48;

function pillColors(t: Tokens, ready: boolean) {
  // On green, `onSuccess2` sits too close to `onSuccess` for the ring to read: the track is a wash.
  return ready
    ? { bg: t.success, fg: t.onSuccess, track: withAlpha(t.onSuccess, 0.32), ring: t.onSuccess, pressed: t.success }
    : { bg: t.surface, fg: t.ink, track: t.lineStrong, ring: t.ink, pressed: t.surface2 };
}

/**
 * The pill itself: surface, floating elevation, radius 14 (the cart bar's family), 48pt tall,
 * as wide as its words. Ready: `success` with `onSuccess` text (in dark mode its ring is green
 * too, so no grey hairline sits around the green).
 */
export function ActiveOrderPill({ order, style }: { order: OrderDTO; style?: StyleProp<ViewStyle> }) {
  const t = useTokens();
  const ready = order.status === "ready";
  const c = pillColors(t, ready);
  const label = chipLabel(order);

  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={HINT}
      onPress={() => openOrder(order)}
      pressedColor={c.pressed}
      style={[
        styles.pill,
        elevation("floating", t),
        { backgroundColor: c.bg },
        isDark(t) && ready ? { borderColor: t.success } : null,
        style,
      ]}
    >
      <ProgressRing status={order.status} track={c.track} fill={c.ring} />
      <T variant="button" numberOfLines={1} tabular style={[styles.pillLabel, { color: c.fg }]}>
        {label}
      </T>
      <ChevronRight size={20} strokeWidth={1.75} color={c.fg} />
    </PressableScale>
  );
}

/** Says "P-003 · Hazır" once (and plays `success`) when the order turns ready while the tabs are on screen. */
function useReadyCue(order: OrderDTO | null, onScreen: boolean) {
  const last = useRef<{ id: string; status: OrderDTO["status"] } | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = order ? { id: order.id, status: order.status } : null;
    if (!order || !onScreen || order.status !== "ready") return;
    if (prev?.id !== order.id || prev.status === "ready") return;
    haptic("success");
    AccessibilityInfo.announceForAccessibility(chipLabel(order));
  }, [order?.id, order?.status, onScreen]);
}

/**
 * Native tab bar heights the pill floats above, without the bottom safe area: UITabBar 49pt
 * (iOS < 26); Material 3 BottomNavigationView 80dp (Android, react-native-screens 4.30 themes it
 * Material3), which sits above the gesture inset. Neither navigator reports its height to JS.
 */
const NATIVE_TAB_BAR = Platform.select({ ios: 49, android: 80, default: 64 })!;

/**
 * For the native customer tabs (Android and iOS < 26): the pill centred, 8pt above the tab
 * bar. Mount it as a sibling over `NativeTabs`. Hidden while the keyboard is up (it would ride
 * on top of it) and while the tabs are covered (a root-stack screen or a sheet).
 */
export function FloatingActiveOrderPill() {
  const order = useActiveOrder();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const keyboard = useKeyboardShown();
  useReadyCue(order, focused);
  if (!order || keyboard) return null;
  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: NATIVE_TAB_BAR + insets.bottom + 8 }]}>
      <PillPresence order={order} />
    </View>
  );
}

/**
 * For the browser preview's JS tab bar: wraps the bar and floats the pill 8pt above it.
 * `tabBar={(p) => <WithActiveOrderPill><WebTabBar {...p} /></WithActiveOrderPill>}`.
 */
export function WithActiveOrderPill({ children }: { children: React.ReactNode }) {
  const order = useActiveOrder();
  const focused = useIsFocused();
  useReadyCue(order, focused);
  return (
    <View>
      {order ? (
        <View pointerEvents="box-none" style={styles.anchorAbove}>
          <PillPresence order={order} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Fades up 8pt when an order starts, fades out when it ends (reduced motion: no move). */
function PillPresence({ order }: { order: OrderDTO }) {
  return (
    <Animated.View
      key={order.id}
      entering={FadeInDown.duration(durations.ui).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(durations.reduced).reduceMotion(ReduceMotion.System)}
      style={styles.presence}
    >
      <ActiveOrderPill order={order} />
    </Animated.View>
  );
}

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/* ------------------------------------------------------------------------------------------ */
/* iOS 26 bottom accessory                                                                     */
/* ------------------------------------------------------------------------------------------ */

/**
 * The Hazır cue on iOS 26, where there is no pill: mount it in the tab layout beside
 * `NativeTabs`. It renders nothing. (The accessory itself keeps no hooks of its own: it is
 * rendered twice and may sit outside the navigation tree.)
 */
export function ActiveOrderReadyCue() {
  const order = useActiveOrder();
  const focused = useIsFocused();
  useReadyCue(order, focused);
  return null;
}

/**
 * The content of `NativeTabs.BottomAccessory` (iOS 26+). It sits on the system's Liquid Glass,
 * so it draws no fill of its own. Regular: ring + "P-003 · Hazırlanıyor" + chevron. Inline (the
 * tab bar minimised on scroll): ring + "P-003". The state lives in the store, outside.
 */
export function ActiveOrderAccessory({ order }: { order: OrderDTO }) {
  const t = useTokens();
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const ready = order.status === "ready";
  const label = chipLabel(order);
  const inline = placement === "inline";

  return (
    <PressableScale
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={HINT}
      onPress={() => openOrder(order)}
      targetScale={1}
      style={[styles.accessory, { paddingHorizontal: inline ? 12 : 16 }]}
    >
      <ProgressRing status={order.status} track={t.lineStrong} fill={ready ? t.success : t.ink} />
      <T variant="button" numberOfLines={1} tabular style={[styles.accessoryLabel, { color: t.ink }]}>
        {inline ? (orderCode(order) ?? label) : label}
      </T>
      {inline ? null : <ChevronRight size={20} strokeWidth={1.75} color={t.ink2} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  ring: { width: RING, height: RING },
  anchor: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: 16 },
  anchorAbove: { position: "absolute", left: 0, right: 0, bottom: "100%", paddingBottom: 8, paddingHorizontal: 16, alignItems: "center" },
  presence: { maxWidth: "100%" },
  pill: {
    maxWidth: "100%",
    minHeight: PILL_HEIGHT,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 10,
  },
  pillLabel: { flexShrink: 1, fontFamily: fonts.sansSemiBold },
  accessory: { flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  accessoryLabel: { flexShrink: 1, flexGrow: 1 },
});
