/**
 * The Peni jetonu (design-system.md §6.1, §12.5): each café's own copper trade token. Always
 * decorative; the amount beside it is the text.
 *
 * Motion (§7.2) runs on a wrapping `Animated.View`, never on SVG props:
 * - A6 coin-strike (peni earned): drop in on `springs.strike` (y −14 → 0, scale 1.2 → 1,
 *   opacity 0 → 1), then on touchdown a 90ms `scaleY .94 → 1` squash and the `success` haptic.
 *   `onLand` fires at touchdown: start the CountWheel there.
 *   Reduced motion: opacity 0 → 1 over 150ms; nothing moves.
 * - A7 coin-flip (gift accepted): `rotateY 0 → 360` over 420ms (`EASE_OUT_STRONG`) with
 *   perspective 600; the back face ("+30 / PENİ") shows through the middle of the turn, and
 *   the `success` haptic plays as it starts. Reduced motion: a 150ms crossfade to the back and
 *   back again, in the same 420ms.
 *
 * An animation plays when `animate` is set: on mount, when it changes from null, or when the
 * `key` changes. Re-renders never restart it.
 */
import type { CoinSize } from "@peni/brand/shapes";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { haptic } from "@/lib/haptics";
import { durations, EASE_OUT_STRONG, springs, useMotionReduced } from "@/lib/motion";
import { hidden, PLAY_ALWAYS, REDUCED_FADE } from "./_internal";
import { CoinArt, type CoinCafe } from "./coin-art";

export type { CoinCafe } from "./coin-art";

export interface CoinProps {
  /** 16 inline and wordmark · 28 rows, cart, post avatar · 56 wallet cards · 96 earn moment, Peni kodum, giriş. */
  size: CoinSize;
  /** The café whose token this is. Omit for the generic coin ("PENİ · MAHALLENİN MASASI"). */
  cafe?: CoinCafe | null;
  /** "back" shows the value side ("1 / PENİ", or `backLabel`). Normally only seen during the flip. */
  face?: "front" | "back";
  /** The back face value during a flip: "+30". */
  backLabel?: string;
  /** "strike" (A6) or "flip" (A7). See the file header. */
  animate?: "strike" | "flip" | null;
  /** Strike only: the coin has touched down. Start the number roll here (A6). */
  onLand?: () => void;
  /** The animation has fully finished. */
  onAnimationComplete?: () => void;
  /** Play the animation's `success` haptic (default true). The component plays it; callers don't. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The strike drop, in pt (the same at every size, as on the web). */
const STRIKE_DROP = -14;
const STRIKE_SCALE = 1.2;
/** The squash: two 45ms halves. */
const SQUASH = { duration: 45, easing: EASE_OUT_STRONG } as const;
/** The strike spring's perceptual duration: when the coin visibly touches down. */
const LANDING_MS = springs.strike.duration;
const FLIP_PERSPECTIVE = 600;

export const Coin = memo(function Coin({
  size,
  cafe,
  face = "front",
  backLabel,
  animate = null,
  onLand,
  onAnimationComplete,
  haptics = true,
  style,
}: CoinProps) {
  const box: StyleProp<ViewStyle> = [{ width: size, height: size }, style];
  const art = <CoinArt size={size} cafe={cafe} face={face} backLabel={backLabel} />;

  if (animate === "strike") {
    return (
      <Strike style={box} onLand={onLand} onComplete={onAnimationComplete} haptics={haptics}>
        {art}
      </Strike>
    );
  }
  if (animate === "flip") {
    return (
      <Flip
        style={box}
        front={art}
        back={<CoinArt size={size} cafe={cafe} face="back" backLabel={backLabel} />}
        onComplete={onAnimationComplete}
        haptics={haptics}
      />
    );
  }
  return (
    <View {...hidden} style={box} pointerEvents="none">
      {art}
    </View>
  );
});

/** Keeps the latest callbacks without restarting the animation that will call them. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

interface PartProps {
  style: StyleProp<ViewStyle>;
  onComplete?: () => void;
  haptics: boolean;
}

function Strike({ style, children, onLand, onComplete, haptics }: PartProps & { children: ReactNode; onLand?: () => void }) {
  const reduced = useMotionReduced();
  // Start values are set at mount, so the first frame is already "before the strike".
  const y = useSharedValue(reduced ? 0 : STRIKE_DROP);
  const scale = useSharedValue(reduced ? 1 : STRIKE_SCALE);
  const scaleY = useSharedValue(1);
  const opacity = useSharedValue(0);
  const cbs = useLatest({ onLand, onComplete, haptics });

  useEffect(() => {
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      if (cbs.current.haptics) haptic("success");
      cbs.current.onLand?.();
    };
    const complete = () => cbs.current.onComplete?.();

    if (reduced) {
      opacity.value = withTiming(1, REDUCED_FADE, (finished) => {
        if (finished) {
          scheduleOnRN(land);
          scheduleOnRN(complete);
        }
      });
      return;
    }

    y.value = withSpring(0, springs.strike);
    scale.value = withSpring(1, springs.strike);
    // Opacity rides the same spring but never overshoots (an overshoot would flicker below 1).
    opacity.value = withSpring(1, { ...springs.strike, overshootClamping: true });
    scaleY.value = withDelay(
      LANDING_MS,
      withSequence(
        withTiming(0.94, SQUASH),
        withTiming(1, SQUASH, (finished) => {
          if (finished) scheduleOnRN(complete);
        }),
      ),
    );
    const timer = setTimeout(land, LANDING_MS);
    return () => clearTimeout(timer);
    // One strike per mount; a new strike is a new mount (see the file header).
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }, { scale: scale.value }, { scaleY: scaleY.value }],
  }));

  return (
    <Animated.View {...hidden} pointerEvents="none" style={[style, animated]}>
      {children}
    </Animated.View>
  );
}

function Flip({ style, front, back, onComplete, haptics }: PartProps & { front: ReactNode; back: ReactNode }) {
  const reduced = useMotionReduced();
  const deg = useSharedValue(0);
  const backOpacity = useSharedValue(0);
  const cbs = useLatest({ onComplete, haptics });

  useEffect(() => {
    if (cbs.current.haptics) haptic("success");
    const complete = () => cbs.current.onComplete?.();
    const done = (finished?: boolean) => {
      "worklet";
      if (finished) scheduleOnRN(complete);
    };
    if (reduced) {
      // 150 in, a 120 hold, 150 out: the flip's 420ms, with nothing rotating.
      const hold = durations.flip - 2 * durations.reduced;
      backOpacity.value = withSequence(
        PLAY_ALWAYS,
        withTiming(1, REDUCED_FADE),
        withDelay(hold, withTiming(0, REDUCED_FADE, done), PLAY_ALWAYS),
      );
      return;
    }
    deg.value = withTiming(360, { duration: durations.flip, easing: EASE_OUT_STRONG }, done);
  }, []);

  // Each face turns on its own (Android has no preserve-3d), and hides while it faces away.
  const frontStyle = useAnimatedStyle(() => {
    const d = deg.value;
    return {
      opacity: Math.cos((d * Math.PI) / 180) >= 0 ? 1 : 0,
      transform: [{ perspective: FLIP_PERSPECTIVE }, { rotateY: `${d}deg` }],
    };
  });
  const backStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: backOpacity.value };
    const d = deg.value;
    return {
      opacity: Math.cos((d * Math.PI) / 180) >= 0 ? 0 : 1,
      transform: [{ perspective: FLIP_PERSPECTIVE }, { rotateY: `${d + 180}deg` }],
    };
  });

  return (
    <View {...hidden} pointerEvents="none" style={style}>
      <Animated.View style={[faceStyle, reduced ? null : frontStyle]}>{front}</Animated.View>
      <Animated.View style={[faceStyle, backStyle]}>{back}</Animated.View>
    </View>
  );
}

const faceStyle: ViewStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backfaceVisibility: "hidden",
};
