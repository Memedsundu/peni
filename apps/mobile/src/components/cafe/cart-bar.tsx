/**
 * CartBar (design-system.md §9.3, §10.2, D10, A4): the café screen's one floating layer.
 *
 * - 64pt tall above the bottom inset, 12pt from the sides, radius 14. A full-width button:
 *   "2 ürün · ₺150" on the left (the total rolls), "Sepeti gör" + `ArrowRight` on the right.
 *   It opens the `sepet` sheet.
 * - iOS 26: a `GlassView` (`regular`), only when `isLiquidGlassAvailable() &&
 *   isGlassEffectAPIAvailable()`. Everywhere else `surface` with the floating elevation.
 * - A4: it slides up from below when the cart gets its first item (250ms, drawer curve) and
 *   bumps 1 → 1.03 → 1 on every add. Reduced motion: a 150ms fade, no bump.
 */
import { cartCopy } from "@peni/brand/copy";
import { formatTL, SEP } from "@peni/brand/format";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { ArrowRight } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, NumberRoll, PressableScale, T } from "@/components/ui";
import { durations, EASE_DRAWER, springs, useMotionReduced } from "@/lib/motion";
import { elevation, radius, useTokens } from "@/lib/theme";

export const CART_BAR_HEIGHT = 64;
const SIDE = 12;

/** Glass only where the system draws it (iOS 26); decided once, it can't change at runtime. */
const GLASS = Platform.OS === "ios" && safe(isLiquidGlassAvailable) && safe(isGlassEffectAPIAvailable);

function safe(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

/** The space the bar takes at the bottom of the screen (for the scroll content's padding). */
export function useCartBarSpace(): number {
  const insets = useSafeAreaInsets();
  return CART_BAR_HEIGHT + Math.max(insets.bottom, SIDE);
}

export function CartBar({ count, dueKurus, onPress }: { count: number; dueKurus: number; onPress: () => void }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const reduced = useMotionReduced();

  /* A4 bump on every add (never on the first appearance, never on a removal). */
  const scale = useSharedValue(1);
  const last = useRef(count);
  useEffect(() => {
    const before = last.current;
    last.current = count;
    if (reduced || count <= before || before === 0) return;
    scale.set(withSequence(withTiming(1.03, { duration: 90 }), withSpring(1, springs.snappy)));
  }, [count, reduced, scale]);
  const bump = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const entering = reduced ? FadeIn.duration(durations.reduced) : SlideInDown.duration(durations.move).easing(EASE_DRAWER);
  const exiting = reduced ? FadeOut.duration(durations.reduced) : SlideOutDown.duration(durations.ui);

  const label = `${cartCopy.open}, ${cartCopy.itemCount(count)}, ${formatTL(dueKurus)}`;

  const face = (
    <PressableScale
      onPress={onPress}
      pressedColor={GLASS ? undefined : t.surface2}
      accessibilityLabel={label}
      accessibilityHint="Sepetin açılır"
      style={styles.press}
    >
      <View style={styles.left} aria-hidden>
        <T variant="button" tabular>
          {cartCopy.itemCount(count)}
          {SEP}
        </T>
        <NumberRoll kind="tl" value={dueKurus} variant="button" />
      </View>
      <View style={styles.right} aria-hidden>
        <T variant="button">{cartCopy.open}</T>
        <Icon icon={ArrowRight} size={20} color={t.ink} />
      </View>
    </PressableScale>
  );

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, SIDE) }]}
    >
      <Animated.View style={[styles.bar, GLASS ? null : [{ backgroundColor: t.surface }, elevation("floating", t)], bump]}>
        {GLASS ? (
          <GlassView glassEffectStyle="regular" isInteractive style={[StyleSheet.absoluteFill, { borderRadius: radius.card }]} />
        ) : null}
        {face}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: SIDE, right: SIDE, zIndex: 40 },
  bar: { height: CART_BAR_HEIGHT, borderRadius: radius.card },
  press: {
    flex: 1,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
  },
  left: { flexDirection: "row", alignItems: "center", flexShrink: 1, minWidth: 0 },
  right: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
});
