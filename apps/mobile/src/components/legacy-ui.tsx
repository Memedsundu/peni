/**
 * Legacy screen kit, kept only until each screen is rebuilt on the new primitives in
 * `src/components/ui/` (§12.5). It is restyled on the İlan tokens and families so the moved
 * screens already read as one product: ink primaries (copper is peni only), 10pt control
 * radius, 14pt cards, Brygada titles ≥20, Archivo body, and never a weight prop next to a family.
 *
 * Do not use it in new code.
 */
import { trUpper } from "@peni/brand/format";
import { CircleAlert, type LucideIcon } from "lucide-react-native";
import { Children, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/lib/haptics";
import { elevation, fonts, hit, radius, typeStyle, useTokens, type Tokens } from "@/lib/theme";

/** The old colour names, mapped onto İlan tokens, for the screens that still use them. */
export interface LegacyTheme extends Tokens {
  /** Peni amounts as text. */
  copper: string;
  copperInk: string;
  copperSoft: string;
  /** Confirmations. */
  leaf: string;
  leafSoft: string;
  /** Errors (always next to `CircleAlert` or a word). */
  berry: string;
}

export function useLegacyTheme(): LegacyTheme {
  const t = useTokens();
  return {
    ...t,
    copper: t.peniInk,
    copperInk: t.onPeni,
    copperSoft: t.peniSoft,
    leaf: t.successInk,
    leafSoft: t.successSoft,
    berry: t.danger,
  };
}

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const t = useTokens();
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={() => {
              haptic("selection");
              onRefresh();
            }}
            tintColor={t.ink}
            colors={[t.ink]}
            progressBackgroundColor={t.surface}
          />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: boolean }) {
  const t = useTokens();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderRadius: radius.card, padding: 16, gap: 8 },
        accent ? { borderWidth: 1.5, borderColor: t.lineStrong } : elevation("raised", t),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Brygada 600. Never below 20 (§4.1). */
export function Title({ children, size = 28 }: { children: ReactNode; size?: number }) {
  const t = useTokens();
  const fontSize = Math.max(20, size);
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={{ fontFamily: fonts.display, fontSize, lineHeight: Math.round(fontSize * 1.15), color: t.ink }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  strong,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  strong?: boolean;
  style?: TextStyle;
}) {
  const t = useTokens();
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      style={[typeStyle(strong ? "strong" : "body"), { color: muted ? t.ink2 : t.ink }, style]}
    >
      {children}
    </Text>
  );
}

function plainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
    .join("");
}

/** `legend`: Archivo 600 13/16, caps through `trUpper` (never a style transform). */
export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTokens();
  return (
    <Text maxFontSizeMultiplier={1.6} style={[typeStyle("legend"), { color: color ?? t.ink2 }]}>
      {trUpper(plainText(children))}
    </Text>
  );
}

type Variant = "primary" | "ghost" | "leaf" | "berry";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  small,
  icon: Icon,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  small?: boolean;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}) {
  const t = useTokens();
  const fill = { primary: t.primary, ghost: t.surface, leaf: t.success, berry: "transparent" }[variant];
  const pressedFill = { primary: t.primaryPressed, ghost: t.surface2, leaf: t.success, berry: t.surface2 }[variant];
  const fg = { primary: t.onPrimary, ghost: t.ink, leaf: t.onSuccess, berry: t.danger }[variant];
  const border = variant === "ghost" ? t.lineStrong : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        // Disabled is never opacity (§3.2): ink-2 on surface-2, no border.
        backgroundColor: disabled ? t.surface2 : pressed ? pressedFill : fill,
        borderColor: disabled ? "transparent" : border,
        borderWidth: 1.5,
        borderRadius: radius.control,
        minHeight: small ? hit : 48,
        paddingHorizontal: small ? 14 : 20,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      {Icon ? <Icon size={20} strokeWidth={1.75} color={disabled ? t.ink2 : fg} /> : null}
      <Text maxFontSizeMultiplier={1.4} style={[typeStyle("button"), { color: disabled ? t.ink2 : fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const t = useTokens();
  return (
    <TextInput
      placeholderTextColor={t.ink2}
      selectionColor={t.ink}
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[
        {
          minHeight: 48,
          borderWidth: 1.5,
          borderColor: t.lineStrong,
          backgroundColor: t.surface,
          color: t.ink,
          borderRadius: radius.control,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontFamily: fonts.sans,
          fontSize: 16,
        },
        props.style,
      ]}
    />
  );
}

/** A plain copper disc; the real `Coin` lives in the brand components. */
export function Coin({ size = 16 }: { size?: number }) {
  const t = useTokens();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size, backgroundColor: t.peni }}
    />
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

export function Loading() {
  const t = useTokens();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: t.bg }}>
      <ActivityIndicator color={t.ink} />
    </View>
  );
}

/**
 * Sheet content frame for the root-stack form sheets (§8.4): the title lives inside the
 * content (Android has no native header in a sheet), and the frame has its natural height,
 * never `flex: 1`, so `sheetAllowedDetents: "fitToContents"` can measure it.
 */
export function SheetBody({ title, children }: { title: string; children?: ReactNode }) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        paddingHorizontal: 16,
        paddingTop: 28,
        paddingBottom: 16 + insets.bottom,
        gap: 12,
      }}
    >
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[typeStyle("h3"), { color: t.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Danger text, always with `CircleAlert` (§3.1). */
export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTokens();
  if (!children) return null;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
      <CircleAlert size={20} strokeWidth={1.75} color={t.danger} style={{ marginTop: 1 }} />
      <Text maxFontSizeMultiplier={1.6} style={[typeStyle("body"), { color: t.danger, flex: 1 }]}>
        {children}
      </Text>
    </View>
  );
}
