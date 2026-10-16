/**
 * Card (design-system.md §5, §12.2, §12.5): radius 14.
 *
 * - `raised`: `surface` with the raised elevation (iOS shadow / Android elevation 2 and a 1pt
 *   `line` border; dark: the border only).
 * - `aski`, `masa`, `peni`, `warning`: flat tinted panels — no shadow, no border.
 *
 * Cards NEVER nest inside cards: a raised card holds flat rows (`RowGroup`). Content that runs
 * edge to edge (rows with pressed fills) is clipped to the corners by an inner layer, so the
 * iOS shadow on the outer layer survives.
 */
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { elevation, radius, space, useTokens, type Tokens } from "@/lib/theme";

export type CardTone = "raised" | "aski" | "masa" | "peni" | "warning";
export type CardPadding = "none" | "md";

const FILL: Record<CardTone, keyof Tokens> = {
  raised: "surface",
  aski: "askiSoft",
  masa: "masaSoft",
  peni: "peniSoft",
  warning: "warningSoft",
};

export interface CardProps extends Omit<ViewProps, "style"> {
  tone?: CardTone;
  /** `md`: 16pt (§5 card padding on phones). `none` for cards that hold rows edge to edge. */
  padding?: CardPadding;
  /** Clip the content to the rounded corners. Default: on when `padding="none"`. */
  clip?: boolean;
  /** The inner layer (padding, gap, layout). */
  style?: StyleProp<ViewStyle>;
  /** The outer layer (margins, width, flex). */
  containerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Card({ tone = "raised", padding = "md", clip, style, containerStyle, children, ...rest }: CardProps) {
  const t = useTokens();
  const raised = tone === "raised";
  const clipped = clip ?? padding === "none";
  const outer: ViewStyle = { borderRadius: radius.card, backgroundColor: t[FILL[tone]] };
  // The raised border is 1pt, so the clipping layer's corner is 1pt tighter.
  const innerRadius = raised ? radius.card - 1 : radius.card;
  const inner: ViewStyle = {
    ...(padding === "md" ? { padding: space.card } : null),
    ...(clipped ? { overflow: "hidden", borderRadius: innerRadius } : null),
  };

  return (
    <View {...rest} style={[outer, raised ? elevation("raised", t) : null, containerStyle]}>
      <View style={[inner, style]}>{children}</View>
    </View>
  );
}
