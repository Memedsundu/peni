/**
 * Stepper (design-system.md §12.2, §12.5): − 44 · count 28 · + 44 = the fixed 116pt menu slot.
 *
 * - A2 `stepper-tap`: each button settles at 0.94 and springs back with `springs.tap`; the count
 *   rolls (CountWheel). Reduced motion: no scale (the fill steps to `surface2`), the number swaps.
 * - A3 `plus-expand`: from 0 → 1, "−" and the count fade in (`FadeIn.duration(200)`) inside the
 *   slot, so nothing shifts. Instant under reduced motion; still on first paint.
 * - The buttons are named "Latte ekle" / "Latte azalt" and carry the count as their value; each
 *   change is announced. When "−" collapses the stepper, screen-reader focus moves to "+".
 * - Disabled at a bound is `ink2` on `surface2` with no border — never opacity. At `max`, the
 *   reason ("Bakiyen 141") shows under the stepper.
 * - "+" and "−" fire the `tap` haptic (§7.3).
 */
import { cartCopy } from "@peni/brand/copy";
import { formatNumber } from "@peni/brand/format";
import { Minus, Plus, type LucideIcon } from "lucide-react-native";
import { useRef, type ComponentRef, type Ref } from "react";
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, LayoutAnimationConfig, ReduceMotion } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { durations, springs, STEPPER_SCALE } from "@/lib/motion";
import { radius, useTokens } from "@/lib/theme";
import { CountWheel } from "./count-wheel";
import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Names the buttons: "Latte ekle" / "Latte azalt". */
  itemName: string;
  /**
   * At `value === min`, show only the "+" (the menu row's 0 state) and let "−" and the count
   * fade in on the first add (A3). Defaults to `min === 0`. With `false` the full stepper is
   * always drawn and "−" sits disabled on `surface2` at the minimum.
   */
  collapsible?: boolean;
  disabled?: boolean;
  /** Shown under the stepper while "+" is disabled at `max` ("Bakiyen 141"). */
  maxReason?: string;
  style?: StyleProp<ViewStyle>;
}

const BUTTON = 44;
const SLOT = 116;
const enter = FadeIn.duration(durations.ui).reduceMotion(ReduceMotion.System);

type PressRef = ComponentRef<typeof View>;

function announce(text: string) {
  if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
  else AccessibilityInfo.announceForAccessibility(text);
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
  step = 1,
  itemName,
  collapsible = min === 0,
  disabled = false,
  maxReason,
  style,
}: StepperProps) {
  const plusRef = useRef<PressRef>(null);
  const collapsed = collapsible && value <= min;
  const atMin = value <= min;
  const atMax = value >= max;
  const showReason = atMax && !disabled && !!maxReason;
  const spoken = formatNumber(value);

  // 2 digits fit the 28pt count; longer counts (a peni amount) widen it instead of clipping.
  const digits = String(Math.max(Math.abs(max), Math.abs(min))).length;
  const countWidth = Math.max(28, digits * 10 + 8);

  const change = (next: number) => {
    if (next === value) return;
    haptic("tap");
    onChange(next);
    announce(formatNumber(next));
    // "−" is about to disappear under the reader's finger: hand focus to "+".
    if (collapsible && next <= min && plusRef.current && Platform.OS !== "web") {
      const target = plusRef.current;
      setTimeout(() => AccessibilityInfo.sendAccessibilityEvent(target, "focus"), 50);
    }
  };

  const stepper = (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", minWidth: SLOT },
        showReason ? null : style,
      ]}
    >
      <LayoutAnimationConfig skipEntering>
        {!collapsed ? (
          <Animated.View key="minus-and-count" entering={enter} style={{ flexDirection: "row", alignItems: "center" }}>
            <StepButton
              icon={Minus}
              label={cartCopy.remove(itemName)}
              value={spoken}
              disabled={disabled || atMin}
              onPress={() => change(Math.max(min, value - step))}
            />
            <View
              aria-hidden
              style={{ minWidth: countWidth, alignItems: "center" }}
            >
              <CountWheel value={value} variant="item" color={disabled ? "ink2" : "ink"} />
            </View>
          </Animated.View>
        ) : null}
      </LayoutAnimationConfig>
      <StepButton
        ref={plusRef}
        icon={Plus}
        label={cartCopy.add(itemName)}
        value={collapsed ? undefined : spoken}
        hint={showReason ? maxReason : undefined}
        disabled={disabled || atMax}
        onPress={() => change(Math.min(max, value + step))}
      />
    </View>
  );

  if (!showReason) return stepper;
  return (
    <View style={[{ alignItems: "flex-end", gap: 4 }, style]}>
      {stepper}
      <T variant="meta" color="ink2" align="right" aria-hidden>
        {maxReason}
      </T>
    </View>
  );
}

function StepButton({
  ref,
  icon,
  label,
  value,
  hint,
  disabled,
  onPress,
}: {
  ref?: Ref<PressRef>;
  icon: LucideIcon;
  label: string;
  value?: string;
  hint?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  return (
    <PressableScale
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      targetScale={STEPPER_SCALE}
      releaseSpring={springs.tap}
      pressedColor={t.surface2}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityValue={value != null ? { text: value } : undefined}
      style={{
        width: BUTTON,
        height: BUTTON,
        borderRadius: radius.full,
        borderWidth: 1.5,
        borderColor: disabled ? "transparent" : t.lineStrong,
        backgroundColor: disabled ? t.surface2 : t.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon icon={icon} size={20} color={disabled ? t.ink2 : t.ink} />
    </PressableScale>
  );
}
