/**
 * EmptyState (design-system.md §12.2, §12.5): a 64pt `surface2` disc with the icon (lucide 32 at
 * stroke 1.5, `ink2`), one sentence, and at most one secondary button. Centred, calm, no
 * illustration.
 */
import type { Href } from "expo-router";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";
import { radius, useTokens } from "@/lib/theme";
import { Button } from "./button";
import { Icon, type IconProp } from "./icon";
import { T } from "./t";

export interface EmptyStateAction {
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  href?: Href;
}

export interface EmptyStateProps {
  icon: IconProp;
  /** One sentence ("Henüz siparişin yok. Bir kafe seç, ilk siparişini ver."). */
  text: string;
  action?: EmptyStateAction;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, text, action, style }: EmptyStateProps) {
  const t = useTokens();
  return (
    <View style={[{ alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 40 }, style]}>
      <View
        aria-hidden
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: t.surface2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon icon={icon} size={32} color={t.ink2} />
      </View>
      <T variant="body" align="center" style={{ maxWidth: 320 }}>
        {text}
      </T>
      {action ? <Button variant="secondary" title={action.label} onPress={action.onPress} href={action.href} /> : null}
    </View>
  );
}
