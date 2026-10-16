/**
 * Brand glyphs on the 24-grid (design-system.md §6.7): stroke glyphs, stroke 1.75, round caps
 * and joins, `viewBox="0 0 24 24"`. Decorative: always hidden from readers, with a real text
 * label beside them (or an `accessibilityLabel` on the control that holds them).
 *
 * They take the same props as a lucide-react-native icon (`size`, `color`, `strokeWidth`,
 * `absoluteStrokeWidth`), so they drop into any icon slot: `icon={<HookGlyph size={16} color={t.ink2} />}`.
 * The default colour is `ink`.
 */
import { cafeDevice } from "@peni/brand/format";
import { COIN_GLYPH, DEVICE, GLYPH, HOOK, MANICULE, SIMIT_GLYPH, TABLE, type DeviceKind } from "@peni/brand/shapes";
import { memo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useTokens } from "@/lib/theme";
import { hidden } from "./_internal";

export interface GlyphProps {
  /** Rendered size in pt (width = height). Default 24. */
  size?: number;
  /** Stroke colour. Default `ink`. */
  color?: string;
  /** Stroke width in grid units (or pt with `absoluteStrokeWidth`). Default 1.75. */
  strokeWidth?: number;
  /** Keep the stroke at `strokeWidth` pt whatever the size (the §5 rule for 16pt icons). */
  absoluteStrokeWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

function gridStroke(size: number, strokeWidth: number, absolute: boolean): number {
  return absolute && size > 0 ? (strokeWidth * 24) / size : strokeWidth;
}

function Glyph({
  size = 24,
  color,
  strokeWidth = GLYPH.strokeWidth,
  absoluteStrokeWidth = false,
  style,
  children,
}: GlyphProps & { children: ReactNode }) {
  const t = useTokens();
  return (
    <View {...hidden} pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg
        width={size}
        height={size}
        viewBox={GLYPH.viewBox}
        fill={GLYPH.fill}
        stroke={color ?? t.ink}
        strokeWidth={gridStroke(size, strokeWidth, absoluteStrokeWidth)}
        strokeLinecap={GLYPH.strokeLinecap}
        strokeLinejoin={GLYPH.strokeLinejoin}
      >
        {children}
      </Svg>
    </View>
  );
}

/** The custom Cüzdan icon (§5): coin rim (r 9), inner ring (r 6.5, stroke 1.25) and a "p" stem. */
export const CoinGlyph = memo(function CoinGlyph(props: GlyphProps) {
  const [rim, ring] = COIN_GLYPH.circles;
  // The inner ring keeps the 1.25 : 1.75 ratio to the rim at any stroke.
  const outer = gridStroke(props.size ?? 24, props.strokeWidth ?? GLYPH.strokeWidth, props.absoluteStrokeWidth ?? false);
  return (
    <Glyph {...props}>
      <Circle cx={rim.cx} cy={rim.cy} r={rim.r} />
      <Circle cx={ring.cx} cy={ring.cy} r={ring.r} strokeWidth={(outer * ring.strokeWidth) / rim.strokeWidth} />
      <Path d={COIN_GLYPH.d} />
    </Glyph>
  );
});

/**
 * A café's device (cezve, glass or fincan): the coin emboss, the cover pattern, the café's own
 * mark. Pass `kind`, or `slug` for `cafeDevice(slug)` (moda → glass, kuzguncuk → fincan).
 */
export const DeviceGlyph = memo(function DeviceGlyph({ kind, slug, ...props }: GlyphProps & { kind?: DeviceKind; slug?: string }) {
  const device = kind ?? (slug ? cafeDevice(slug) : "fincan");
  return (
    <Glyph {...props}>
      <Path d={DEVICE[device]} />
    </Glyph>
  );
});

/** Askı legend icon: a rail with one hook. Also the neutral "ikram" chip on staff tickets. */
export const HookGlyph = memo(function HookGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={HOOK} />
    </Glyph>
  );
});

/** Peni masası icon: a long table with three chairs a side. */
export const TableGlyph = memo(function TableGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={TABLE} />
    </Glyph>
  );
});

/** Simit on the 24-grid (§5 lists it; the path lives in @peni/brand). */
export const SimitGlyph = memo(function SimitGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={SIMIT_GLYPH} />
    </Glyph>
  );
});

/**
 * The printer's fist. At most once per screen, and only on the "Neden peni?" link (§6.7),
 * at 18pt there (§9.1).
 */
export const Manicule = memo(function Manicule(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <Path d={MANICULE} />
    </Glyph>
  );
});
