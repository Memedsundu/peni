/**
 * Café colourway band (design-system.md §6.6). It means "which café" and is never a text
 * background (covers and the press-header café name excepted). Sizes in pt:
 * 6 on top of wallet coin cards · 4 on top of staff tickets · 2 under the press header ·
 * 3 (vertical) as the left edge of café posts. In dark mode it carries the 1px plate ring,
 * because the colourways sit at 1.2–2.0:1 against the dark page.
 */
import { cafeHue } from "@peni/brand/format";
import { cafeHues, plateRing, type CafeHue } from "@peni/brand/tokens";
import { memo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { isDark, useTokens, type Tokens } from "@/lib/theme";
import { hidden } from "./_internal";

/** The café's colourway colour: its own choice [G9], else `cafeHue(slug)`. */
export function hueColor(slug: string, hue?: CafeHue | null): string {
  return cafeHues[hue ?? cafeHue(slug)];
}

/** The dark-mode 1px plate ring as an outset `boxShadow` (nothing in light mode). */
export function plateRingStyle(t: Tokens): ViewStyle | null {
  return isDark(t) ? { boxShadow: `0px 0px 0px 1px ${plateRing.dark.native}` } : null;
}

export interface CafeHueBandProps {
  slug: string;
  hue?: CafeHue | null;
  /** Thickness in pt. Default 6. */
  size?: 2 | 3 | 4 | 6;
  /** "vertical" is the 3pt left edge of a café post (stretch it in a row). */
  orientation?: "horizontal" | "vertical";
  style?: StyleProp<ViewStyle>;
}

export const CafeHueBand = memo(function CafeHueBand({
  slug,
  hue,
  size = 6,
  orientation = "horizontal",
  style,
}: CafeHueBandProps) {
  const t = useTokens();
  const horizontal = orientation === "horizontal";
  return (
    <View
      {...hidden}
      pointerEvents="none"
      style={[
        { backgroundColor: hueColor(slug, hue) },
        horizontal ? { height: size, alignSelf: "stretch" } : { width: size, alignSelf: "stretch" },
        plateRingStyle(t),
        style,
      ]}
    />
  );
});
