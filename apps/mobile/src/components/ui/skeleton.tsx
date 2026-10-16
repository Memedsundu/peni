/**
 * Skeleton (design-system.md §9, §12.5): a static `surface2` block with the final geometry — no
 * shimmer, no pulse (no infinite animation exists in this system). A text line's skeleton is
 * 0.7 × the line height it replaces (`line="body"` → 15pt), with the radius of the real element.
 *
 * Skeletons are hidden from screen readers; mark the region they fill busy
 * (`accessibilityState={{ busy: true }}`) and drop it when the content lands.
 */
import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { radius as radii, typeScale, useTokens, type TypeVariant } from "@/lib/theme";

export type SkeletonRadius = 0 | 4 | 10 | 14 | 22 | "full";

export interface SkeletonProps {
  width?: DimensionValue;
  /** An exact height (covers, buttons). Ignored when `line` is given. */
  height?: number;
  /** Stand-in for one line of this type variant: 0.7 × its line height. */
  line?: TypeVariant;
  /** Default 4 (a line of text). */
  radius?: SkeletonRadius;
  /** For covers: `16 / 7`. */
  aspectRatio?: number;
  style?: StyleProp<ViewStyle>;
}

export function skeletonLineHeight(variant: TypeVariant): number {
  return Math.round(typeScale[variant].lineHeight * 0.7);
}

export function Skeleton({ width = "100%", height, line, radius = 4, aspectRatio, style }: SkeletonProps) {
  const t = useTokens();
  const h = line ? skeletonLineHeight(line) : aspectRatio ? undefined : (height ?? 16);
  return (
    <View
      aria-hidden
      style={[
        {
          width,
          height: h,
          aspectRatio,
          borderRadius: radius === "full" ? radii.full : radius,
          backgroundColor: t.surface2,
        },
        // A line keeps its row's height, so the layout doesn't jump when the text lands.
        line ? { marginVertical: (typeScale[line].lineHeight - skeletonLineHeight(line)) / 2 } : null,
        style,
      ]}
    />
  );
}
