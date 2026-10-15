import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { serif, useTheme } from "@/lib/theme";

export function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.copper} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: ViewStyle; accent?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderColor: accent ? t.copper : t.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 16, padding: 16, gap: 8 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Title({ children, size = 26 }: { children: ReactNode; size?: number }) {
  const t = useTheme();
  return <Text style={{ ...serif, fontSize: size, color: t.ink }}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 15, lineHeight: 21, color: muted ? t.ink2 : t.ink }, style]}>{children}</Text>;
}

export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: color ?? t.copper }}>{children}</Text>;
}

type Variant = "primary" | "ghost" | "leaf" | "berry";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  small?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.copper, ghost: t.surface, leaf: t.leaf, berry: "transparent" }[variant];
  const fg = { primary: t.copperInk, ghost: t.ink, leaf: t.surface, berry: t.berry }[variant];
  const border = { primary: t.copper, ghost: t.line, leaf: t.leaf, berry: t.berry }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: border,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: small ? 7 : 11,
        paddingHorizontal: small ? 12 : 18,
        alignItems: "center",
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        minHeight: 36,
        justifyContent: "center",
      })}
    >
      <Text style={{ color: fg, fontWeight: "700", fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.ink2}
      {...props}
      style={[{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 }, props.style]}
    />
  );
}

export function Coin({ size = 14 }: { size?: number }) {
  const t = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: t.copper }} />;
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>;
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: t.bg }}>
      <ActivityIndicator color={t.copper} />
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return children ? <Text style={{ color: t.berry }}>{children}</Text> : null;
}
