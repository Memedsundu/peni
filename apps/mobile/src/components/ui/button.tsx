/**
 * Button (design-system.md §12.2, §12.5). Radius 10, `button` type, A1 press.
 *
 * - `primary`: the ink fill — every primary is ink ("Gönder", "Katıl", "Ismarla" too). Copper
 *   is NEVER a button colour (§3.2); there is deliberately no peni variant.
 * - `secondary`: `surface` with a 1.5pt `lineStrong` border. `quiet`: transparent ink text.
 * - `aski`: the "Askıdan al" fill, askı only. `danger-quiet`: "İptal et", "Çıkış yap".
 * - Sizes are minimum heights — sm 44 · md 48 · lg 56 (staff primary actions are lg). A label
 *   that has to wrap grows the button instead of being clipped.
 * - Disabled is never opacity: `ink2` on `surface2` with no border, and the reason is shown
 *   under the button (`disabledReason`, "Masa doldu") and read with it.
 * - `loading`: the spinner and "Gönderiliyor…"; presses are ignored, the look stays.
 *
 * Every variant keeps a 1.5pt border (transparent unless secondary), so an `aski` and a
 * `secondary` button side by side are exactly the same size.
 */
import { cartCopy } from "@peni/brand/copy";
import { router, type Href } from "expo-router";
import { Children, type ReactNode } from "react";
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { haptic, type HapticIntent } from "@/lib/haptics";
import { radius, useTokens, type Tokens } from "@/lib/theme";
import { Icon, type IconProp } from "./icon";
import { PressableScale } from "./pressable-scale";
import { Spinner } from "./spinner";
import { T } from "./t";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "aski" | "danger-quiet";
/** sm 44 · md 48 · lg 56. */
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  /** Navigates with `router.push` and reads as a link. */
  href?: Href;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (lucide). */
  icon?: IconProp;
  /** Trailing icon ("Sepeti gör" + `ArrowRight`). */
  iconEnd?: IconProp;
  /** In flight: the spinner and "Gönderiliyor…" (or `loadingLabel`); presses are ignored. */
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  /** Why it can't be used ("Masa doldu", "Bakiyen 75"): shown under the button and read with it. */
  disabledReason?: string;
  /** Stretches to its container (sheet primaries). */
  fullWidth?: boolean;
  /** Fires the §7.3 pattern on press: `confirm` for "Siparişi gönder", `tap` for "Askıdan al". */
  haptic?: HapticIntent;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Applied to the outermost element (the column with the reason, when there is one). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

interface Look {
  bg: string;
  fg: string;
  border: string;
  pressed: string;
}

function look(t: Tokens, variant: ButtonVariant, disabled: boolean): Look {
  if (disabled) return { bg: t.surface2, fg: t.ink2, border: "transparent", pressed: t.surface2 };
  switch (variant) {
    case "primary":
      return { bg: t.primary, fg: t.onPrimary, border: "transparent", pressed: t.primaryPressed };
    case "secondary":
      return { bg: t.surface, fg: t.ink, border: t.lineStrong, pressed: t.surface2 };
    case "quiet":
      return { bg: "transparent", fg: t.ink, border: "transparent", pressed: t.surface2 };
    case "aski":
      return { bg: t.aski, fg: t.onAski, border: "transparent", pressed: t.askiPressed };
    case "danger-quiet":
      return { bg: "transparent", fg: t.danger, border: "transparent", pressed: t.dangerSoft };
  }
}

const HEIGHT: Record<ButtonSize, number> = { sm: 44, md: 48, lg: 56 };
const PAD_Y: Record<ButtonSize, number> = { sm: 8, md: 10, lg: 12 };

export function Button({
  title,
  onPress,
  href,
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  loading = false,
  loadingLabel,
  disabled = false,
  disabledReason,
  fullWidth = false,
  haptic: intent,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const t = useTokens();
  const c = look(t, variant, disabled && !loading);
  const quiet = variant === "quiet" || variant === "danger-quiet";
  const reason = disabled && disabledReason ? disabledReason : null;
  const label = loading ? (loadingLabel ?? cartCopy.sending) : title;

  const press = (e: GestureResponderEvent) => {
    if (loading || disabled) return;
    if (intent) haptic(intent);
    onPress?.(e);
    if (href != null) router.push(href);
  };

  const button = (
    <PressableScale
      testID={testID}
      onPress={press}
      disabled={disabled || loading}
      pressedColor={c.pressed}
      accessibilityRole={href != null ? "link" : "button"}
      accessibilityLabel={loading ? label : (accessibilityLabel ?? title)}
      accessibilityHint={reason ?? accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        {
          minHeight: HEIGHT[size],
          paddingVertical: PAD_Y[size],
          paddingHorizontal: quiet ? 12 : 20,
          borderRadius: radius.control,
          borderWidth: 1.5,
          borderColor: c.border,
          backgroundColor: c.bg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        fullWidth ? { alignSelf: "stretch" } : null,
        reason ? null : style,
      ]}
    >
      {loading ? <Spinner color={c.fg} /> : icon ? <Icon icon={icon} size={20} color={c.fg} /> : null}
      <T variant="button" align="center" style={{ color: c.fg, flexShrink: 1 }}>
        {label}
      </T>
      {!loading && iconEnd ? <Icon icon={iconEnd} size={20} color={c.fg} /> : null}
    </PressableScale>
  );

  if (!reason) return button;
  return (
    <View style={[{ gap: 6, alignItems: fullWidth ? "stretch" : "flex-start" }, style]}>
      {button}
      <T variant="meta" color="ink2" aria-hidden>
        {reason}
      </T>
    </View>
  );
}

/**
 * Equal-weight buttons in a row, each taking an equal share ("Askıdan al" · "Askıya bırak").
 * Give the buttons `fullWidth`.
 */
export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", gap: 12, alignItems: "flex-start" }, style]}>
      {Children.map(children, (child) => (child == null || child === false ? null : <View style={{ flex: 1 }}>{child}</View>))}
    </View>
  );
}
