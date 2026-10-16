/**
 * CountWheel and NumberRoll (design-system.md §7.2 A17 `number-roll`, §12.5).
 *
 * The Bluesky CountWheel pattern, per digit: each character slot is keyed by its value, so a
 * changed digit mounts fresh and rolls in (translateY ±18 → 0, opacity 0 → 1) while a ghost of
 * the old digit rolls out the other way (0 → ∓18, opacity 1 → 0) over 400ms with
 * `Easing.out(Easing.cubic)`. "1.240 → 1.250" moves only the tens. Rising values roll up,
 * falling values roll down.
 *
 * Both moves are *entering* keyframes (the ghost rests at opacity 0 once it has played), so the
 * direction is always read at the moment of the change — never from a stale exit config — and
 * nothing animates on unmount. `LayoutAnimationConfig skipEntering` keeps the first paint
 * still, and every keyframe carries `ReduceMotion.System`: with Reduce Motion on, the number
 * just swaps.
 *
 * The digits are hidden from screen readers; the whole number is one text element with the
 * formatted value as its label.
 */
import { formatNumber, formatTL, MINUS } from "@peni/brand/format";
import { memo, useRef } from "react";
import { Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  Keyframe,
  LayoutAnimationConfig,
  ReduceMotion,
} from "react-native-reanimated";
import { durations } from "@/lib/motion";
import { typeScale, useTokens, type TokenName, type TypeVariant } from "@/lib/theme";
import { numerals } from "./t";

const DISTANCE = 18;
const EASE = Easing.out(Easing.cubic);

const rollIn = (from: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: from }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE },
  })
    .duration(durations.countWheel)
    .reduceMotion(ReduceMotion.System);

const rollOut = (to: number) =>
  new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }] },
    100: { opacity: 0, transform: [{ translateY: to }], easing: EASE },
  })
    .duration(durations.countWheel)
    .reduceMotion(ReduceMotion.System);

/**
 * Rising: the new digit comes up from below, the old one leaves upwards. Falling: the reverse.
 *
 * The web preview uses Reanimated's built-in fades instead: on react-native-web 4.7, a custom
 * entering Keyframe is "cleaned up" two seconds later by pinning the element with absolute
 * coordinates, which takes the digit out of the row and leaves it behind when the page scrolls.
 * The presets are plain CSS animations and are left alone. iOS and Android get the exact ±18.
 */
const web = Platform.OS === "web";
const D = durations.countWheel;
const SYS = ReduceMotion.System;
const KEYFRAMES = web
  ? {
      up: { enter: FadeInUp.duration(D).reduceMotion(SYS), leave: FadeOutUp.duration(D).reduceMotion(SYS) },
      down: { enter: FadeInDown.duration(D).reduceMotion(SYS), leave: FadeOutDown.duration(D).reduceMotion(SYS) },
    }
  : {
      up: { enter: rollIn(DISTANCE), leave: rollOut(-DISTANCE) },
      down: { enter: rollIn(-DISTANCE), leave: rollOut(DISTANCE) },
    };

export interface CountWheelProps {
  value: number;
  /** Turns the value into the text that is drawn. Default: tr-TR grouping ("1.240"). */
  format?: (value: number) => string;
  /** §4.5 variant for the digits. Default `body`. Counts and prices are always tabular. */
  variant?: TypeVariant;
  color?: TokenName;
  /** Extra text style (a raw colour on a coloured fill). */
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  /** Forces the roll direction: `1` up, `-1` down. Default: from the change. */
  trend?: 1 | -1;
  /** `false` swaps with no roll (a first paint that should not draw the eye). */
  animated?: boolean;
  /** Overrides the spoken label (the formatted value by default). */
  accessibilityLabel?: string;
}

interface Slot {
  key: string;
  char: string;
  /** The character this slot showed before the latest change, if it changed. */
  ghost: { key: string; char: string } | null;
  dir: "up" | "down";
}

interface WheelState {
  value: number;
  text: string;
  slots: Slot[];
  change: number;
}

/** Slots are keyed from the right, so the units digit stays the units digit as numbers grow. */
function diff(prev: WheelState | null, value: number, text: string, dir: "up" | "down", animate: boolean): WheelState {
  const chars = Array.from(text);
  if (!prev) {
    return {
      value,
      text,
      change: 0,
      slots: chars.map((char, i) => ({ key: `${chars.length - 1 - i}:0`, char, ghost: null, dir })),
    };
  }
  const change = prev.change + 1;
  const prevChars = Array.from(prev.text);
  const slots = chars.map((char, i): Slot => {
    const pos = chars.length - 1 - i;
    const before = prev.slots[prevChars.length - 1 - pos];
    if (before && before.char === char) return { ...before, ghost: null };
    return {
      key: `${pos}:${change}`,
      char,
      ghost: animate && before ? { key: `${pos}:${change}:ghost`, char: before.char } : null,
      dir,
    };
  });
  return { value, text, slots, change };
}

export const CountWheel = memo(function CountWheel({
  value,
  format = formatNumber,
  variant = "body",
  color = "ink",
  textStyle,
  style,
  trend,
  animated = true,
  accessibilityLabel,
}: CountWheelProps) {
  const t = useTokens();
  const text = format(value);
  const state = useRef<WheelState | null>(null);

  // Derived during render (no effect, no extra frame): the slots for this text.
  if (!state.current || state.current.text !== text) {
    const prev = state.current;
    const rising = trend ? trend > 0 : prev ? value >= prev.value : true;
    state.current = diff(prev, value, text, rising ? "up" : "down", animated && prev != null);
  }
  const { slots } = state.current;

  const { caps: _caps, maxFontSizeMultiplier, fontVariant, ...base } = typeScale[variant];
  const glyph: StyleProp<TextStyle> = [base, { color: t[color], fontVariant: numerals(fontVariant, true) }, textStyle];

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? text}
      style={[{ flexDirection: "row", alignItems: "flex-end" }, style]}
    >
      <LayoutAnimationConfig skipEntering>
        {slots.map((slot) => (
          <View key={slot.key} aria-hidden>
            <Animated.View entering={animated ? KEYFRAMES[slot.dir].enter : undefined}>
              <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={glyph}>
                {slot.char}
              </Text>
            </Animated.View>
            {slot.ghost ? (
              <Animated.View
                key={slot.ghost.key}
                entering={KEYFRAMES[slot.dir].leave}
                pointerEvents="none"
                style={{ position: "absolute", top: 0, left: 0, right: 0, opacity: 0 }}
              >
                <Text maxFontSizeMultiplier={maxFontSizeMultiplier} style={glyph} numberOfLines={1}>
                  {slot.ghost.char}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        ))}
      </LayoutAnimationConfig>
    </View>
  );
});

export type NumberRollKind = "peni" | "tl" | "number";

export interface NumberRollProps extends Omit<CountWheelProps, "format"> {
  /**
   * `peni` and `number`: a whole count ("1.240"). `tl`: KURUŞ, exactly like `formatTL`
   * (12000 → "₺120", 3050 → "₺30,50"). The caller writes the unit word ("peni") beside it.
   */
  kind?: NumberRollKind;
  /** "+2" for positive amounts. Negative amounts always get a true minus (U+2212). */
  signed?: boolean;
}

/** The web `NumberRoll` API on mobile: a CountWheel with the house number formats. */
export function NumberRoll({ kind = "peni", signed = false, value, ...rest }: NumberRollProps) {
  const format = (v: number) => {
    const n = Math.round(v) + 0;
    if (kind === "tl") return signed && n > 0 ? `+${formatTL(n)}` : formatTL(n);
    const body = formatNumber(Math.abs(n));
    return n < 0 ? `${MINUS}${body}` : signed && n > 0 ? `+${body}` : body;
  };
  return <CountWheel value={value} format={format} {...rest} />;
}
