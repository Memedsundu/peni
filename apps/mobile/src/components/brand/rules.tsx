/**
 * Printed rules (design-system.md §5).
 *
 * - `OxfordRule`: 6pt tall, a 3pt line, a 2pt gap, then a 1pt line, in ink. It appears ONLY at
 *   the top of the café masthead and at the head of an order or gift fiş.
 * - `InkRule`: a 1pt ink line (the Masa dateline, under the masthead name).
 *
 * Both are decorative: hidden from readers.
 */
import { memo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTokens } from "@/lib/theme";
import { hidden } from "./_internal";

export interface RuleProps {
  /** Overrides the ink (inside a Hazır fiş the rule is `onSuccess`). */
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export const OxfordRule = memo(function OxfordRule({ color, style }: RuleProps) {
  const t = useTokens();
  const c = color ?? t.ink;
  return (
    <View {...hidden} pointerEvents="none" style={[{ height: 6, alignSelf: "stretch", justifyContent: "space-between" }, style]}>
      <View style={{ height: 3, backgroundColor: c }} />
      <View style={{ height: 1, backgroundColor: c }} />
    </View>
  );
});

export const InkRule = memo(function InkRule({ color, style }: RuleProps) {
  const t = useTokens();
  return <View {...hidden} pointerEvents="none" style={[{ height: 1, alignSelf: "stretch", backgroundColor: color ?? t.ink }, style]} />;
});
