/**
 * PressableScale (design-system.md §12.5, A1 `press`): the Bluesky pattern on Reanimated 4.7.
 *
 * Pointer down settles the control at 0.97 with `withTiming(.97, {duration: 100, easing:
 * EASE_OUT_STRONG})`, and it comes back the same way. Under reduced motion it never scales:
 * the fill steps to `pressedColor` (`primaryPressed`, `askiPressed`, `surface2`) instead, so the
 * press is still seen. The fill step also plays with motion on, matching the web press.
 *
 * - `targetScale={1}` turns the scale off for good (full-bleed rows inside a card).
 * - `releaseSpring` springs back instead of easing back (A2 `stepper-tap`).
 * - Every control is ≥44pt (§17). Anything drawn smaller grows its hit area to 44pt through
 *   `hitSlop` on its own, measured from its layout; an explicit `hitSlop` is kept when larger.
 */
import { useCallback, useEffect, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
  type Insets,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from "react-native-reanimated";
import { PRESS_SCALE, timings } from "@/lib/motion";
import { hit } from "@/lib/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, "style" | "children" | "hitSlop"> {
  style?: StyleProp<ViewStyle>;
  /** The fill while pressed. Always shown under reduced motion, where nothing scales. */
  pressedColor?: string;
  /** Default 0.97 (A1). `1` never scales. */
  targetScale?: number;
  /** Spring back to 1 with this config instead of the 100ms ease (A2 uses `springs.tap`). */
  releaseSpring?: WithSpringConfig;
  hitSlop?: number | Insets;
  /** The smallest hit area, in pt. Default 44 (§17); staff primaries pass 56. */
  minTarget?: number;
  /** The host view (for `AccessibilityInfo.sendAccessibilityEvent`, measuring). */
  ref?: Ref<ComponentRef<typeof View>>;
  children?: ReactNode;
}

/**
 * react-native-web 0.21 reads `aria-*` props only, not `accessibilityState`: mirror the state so
 * tabs, toggles, switches and busy buttons say what they are in the web preview too. Native
 * reads `accessibilityState` as before.
 */
function webAria(role: PressableProps["accessibilityRole"], state: PressableProps["accessibilityState"]) {
  if (!state) return null;
  const out: Record<string, boolean> = {};
  if (state.selected != null) out["aria-selected"] = state.selected;
  if (state.busy != null) out["aria-busy"] = state.busy;
  if (state.disabled != null) out["aria-disabled"] = state.disabled;
  if (state.expanded != null) out["aria-expanded"] = state.expanded;
  if (typeof state.checked === "boolean") out[role === "togglebutton" ? "aria-pressed" : "aria-checked"] = state.checked;
  return out;
}

function toInsets(slop: number | Insets | undefined): Required<Insets> {
  if (typeof slop === "number") return { top: slop, bottom: slop, left: slop, right: slop };
  return { top: slop?.top ?? 0, bottom: slop?.bottom ?? 0, left: slop?.left ?? 0, right: slop?.right ?? 0 };
}

export function PressableScale({
  style,
  pressedColor,
  targetScale = PRESS_SCALE,
  releaseSpring,
  hitSlop,
  minTarget = hit,
  accessibilityRole = "button",
  disabled,
  onPressIn,
  onPressOut,
  onLayout,
  children,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const web = Platform.OS === "web";
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const scales = !reduced && targetScale !== 1;

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // A control disabled mid-press (a request starts) must not stay shrunk or tinted.
  useEffect(() => {
    if (!disabled) return;
    setPressed(false);
    cancelAnimation(scale);
    scale.set(1);
  }, [disabled, scale]);

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (pressedColor) setPressed(true);
      if (scales) {
        cancelAnimation(scale);
        scale.set(withTiming(targetScale, timings.press));
      }
      onPressIn?.(e);
    },
    [onPressIn, pressedColor, scale, scales, targetScale],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (pressedColor) setPressed(false);
      if (scales) {
        cancelAnimation(scale);
        scale.set(releaseSpring ? withSpring(1, releaseSpring) : withTiming(1, timings.press));
      }
      onPressOut?.(e);
    },
    [onPressOut, pressedColor, releaseSpring, scale, scales],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      onLayout?.(e);
    },
    [onLayout],
  );

  const given = toInsets(hitSlop);
  const growX = size ? Math.max(0, (minTarget - size.width) / 2) : 0;
  const growY = size ? Math.max(0, (minTarget - size.height) / 2) : 0;
  const slop: Insets = {
    top: Math.max(given.top, growY),
    bottom: Math.max(given.bottom, growY),
    left: Math.max(given.left, growX),
    right: Math.max(given.right, growX),
  };

  return (
    <AnimatedPressable
      accessibilityRole={web && accessibilityRole === "togglebutton" ? "button" : accessibilityRole}
      {...(web ? webAria(accessibilityRole, rest.accessibilityState) : null)}
      disabled={disabled}
      hitSlop={slop}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLayout={handleLayout}
      style={[style, pressed && pressedColor ? { backgroundColor: pressedColor } : null, scales ? animatedStyle : null]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
