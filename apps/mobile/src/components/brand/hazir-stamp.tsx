/**
 * The HAZIR stamp (design-system.md §6.3, A11): a double-ruled plate tilted −4°, in the fiş's
 * text colour (`onSuccess` inside a Hazır fiş). The double rule is a 3pt border plus an inner
 * 1pt rule inset 2, the same 3 · 2 · 1 rhythm as the Oxford rule.
 *
 * Decorative: the fiş headline "Hazır!" says it in words. `animate` (default true) stamps it
 * down when it mounts (scale 1.6 → 1 with a fade, 240ms, EASE_OUT_STRONG), i.e. when the order
 * turns ready while the customer is looking. Pass false when the screen opens on an order that
 * is already ready. Under reduced motion it just appears.
 */
import { memo, useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { EASE_OUT_STRONG, useMotionReduced } from "@/lib/motion";
import { hidden } from "./_internal";
import { FisText, useFisTokens } from "./fis";

const STAMP_MS = 240;
const FROM_SCALE = 1.6;

export interface HazirStampProps {
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const HazirStamp = memo(function HazirStamp({ animate = true, style }: HazirStampProps) {
  const ft = useFisTokens();
  const reduced = useMotionReduced();
  const play = animate && !reduced;
  const scale = useSharedValue(play ? FROM_SCALE : 1);
  const opacity = useSharedValue(play ? 0 : 1);

  useEffect(() => {
    if (!play) return;
    const timing = { duration: STAMP_MS, easing: EASE_OUT_STRONG };
    scale.value = withTiming(1, timing);
    opacity.value = withTiming(1, timing);
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ rotate: "-4deg" }, { scale: scale.value }],
  }));

  return (
    <Animated.View {...hidden} pointerEvents="none" style={[styles.stamp, { borderColor: ft.ink }, animated, style]}>
      <View style={[styles.inner, { borderColor: ft.ink }]} />
      <FisText variant="plate" style={styles.text}>
        HAZIR
      </FisText>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  stamp: {
    alignSelf: "flex-start",
    borderWidth: 3,
    borderStyle: "solid",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inner: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 1,
    borderRadius: 2,
  },
  text: { fontSize: 22, lineHeight: 24, letterSpacing: 1.3 },
});
