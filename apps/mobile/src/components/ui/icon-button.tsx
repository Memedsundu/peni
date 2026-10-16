/**
 * IconButton (design-system.md §12.2, §12.5): round, 44pt by default.
 *
 * - `quiet` (default): transparent ink icon; pressed fills `surface2`.
 * - `secondary`: `surface` with a 1.5pt `lineStrong` ring (the menu "+").
 * - `press`: on the staff press header — `onPress` icon, a 10% `onPress` wash when pressed.
 *
 * `label` is required and becomes the accessibility label ("Kapat", "Peni kodum", "Latte ekle");
 * the icon is decorative. Pass `pressed` for toggles (sound, heart) to read as a toggle with its
 * state. An icon button has no room for a visible disabled reason: the screen that disables one
 * says why next to it.
 */
import { router, type Href } from "expo-router";
import type { GestureResponderEvent, Insets, StyleProp, ViewStyle } from "react-native";
import { haptic, type HapticIntent } from "@/lib/haptics";
import { radius, useTokens, type Tokens } from "@/lib/theme";
import { Icon, withAlpha, type IconProp } from "./icon";
import { PressableScale } from "./pressable-scale";

export type IconButtonVariant = "secondary" | "quiet" | "press";
export type IconButtonSize = 44 | 48 | 56;

export interface IconButtonProps {
  label: string;
  icon: IconProp;
  onPress?: (e: GestureResponderEvent) => void;
  href?: Href;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** 20 by default (24 at size 56). */
  iconSize?: 16 | 20 | 24;
  /** Overrides the icon colour (a filled heart stays `ink`). */
  iconColor?: string;
  /** Fills the glyph (a reacted heart). */
  iconFill?: string;
  /** A toggle's state: read as "on"/"off" by screen readers. */
  pressed?: boolean;
  disabled?: boolean;
  haptic?: HapticIntent;
  accessibilityHint?: string;
  hitSlop?: number | Insets;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function look(t: Tokens, variant: IconButtonVariant, disabled: boolean) {
  if (disabled) return { bg: t.surface2, fg: t.ink2, border: "transparent", pressed: t.surface2 };
  switch (variant) {
    case "secondary":
      return { bg: t.surface, fg: t.ink, border: t.lineStrong, pressed: t.surface2 };
    case "quiet":
      return { bg: "transparent", fg: t.ink, border: "transparent", pressed: t.surface2 };
    case "press":
      return { bg: "transparent", fg: t.onPress, border: "transparent", pressed: withAlpha(t.onPress, 0.1) };
  }
}

export function IconButton({
  label,
  icon,
  onPress,
  href,
  variant = "quiet",
  size = 44,
  iconSize,
  iconColor,
  iconFill,
  pressed,
  disabled = false,
  haptic: intent,
  accessibilityHint,
  hitSlop,
  style,
  testID,
}: IconButtonProps) {
  const t = useTokens();
  const c = look(t, variant, disabled);
  const toggle = pressed !== undefined;

  return (
    <PressableScale
      testID={testID}
      onPress={(e) => {
        if (intent) haptic(intent);
        onPress?.(e);
        if (href != null) router.push(href);
      }}
      disabled={disabled}
      pressedColor={c.pressed}
      hitSlop={hitSlop}
      accessibilityRole={href != null ? "link" : toggle ? "togglebutton" : "button"}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...(toggle ? { checked: pressed } : null) }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.full,
          borderWidth: 1.5,
          borderColor: c.border,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Icon icon={icon} size={iconSize ?? (size === 56 ? 24 : 20)} color={iconColor && !disabled ? iconColor : c.fg} fill={iconFill} />
    </PressableScale>
  );
}
