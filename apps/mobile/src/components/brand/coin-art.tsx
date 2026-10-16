/**
 * The Peni jetonu as a still picture (design-system.md §6.1). Every number comes from `COIN` /
 * `coinLayers()` in @peni/brand; this file only turns them into react-native-svg. `Coin`
 * (coin.tsx) adds the strike and flip around it, always on a wrapping `Animated.View`.
 *
 * Fonts are set by family name only (each weight is its own family, §4.3): never a weight.
 */
import { cafeDevice, coinInitials, coinLegend } from "@peni/brand/format";
import { beads, COIN, coinLayers, DEVICE, type CoinSize } from "@peni/brand/shapes";
import { memo } from "react";
import { Platform } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText, TextPath } from "react-native-svg";
import { fonts, isDark, useTokens } from "@/lib/theme";
import { useSvgId } from "./_internal";

/** The café a coin belongs to. Without one the coin is the generic coin (sign-in, Peni kodum). */
export interface CoinCafe {
  name: string;
  district?: string | null;
  city?: string | null;
  slug: string;
}

export interface CoinArtProps {
  size: CoinSize;
  cafe?: CoinCafe | null;
  face?: "front" | "back";
  /** Back face value, "+30". Default "1". */
  backLabel?: string;
}

/**
 * §6.1: "If TextPath with letterSpacing renders badly on any Android test device, omit the
 * legend on Android. It is decorative." Flip this to false if a device test shows it.
 */
const RIM_LEGEND_ON_ANDROID = true;

const BEADS = beads();
const C = COIN;

/** One weight per family (§4.3): the SVG text roles map onto the five loaded families. */
const FAMILY = { display: fonts.display, sans: fonts.sansSemiBold, narrow: fonts.narrow } as const;

export const CoinArt = memo(function CoinArt({ size, cafe, face = "front", backLabel }: CoinArtProps) {
  const t = useTokens();
  const id = useSvgId("coin");
  const layers = coinLayers(size, { generic: !cafe, face });
  const device = cafe && layers.device ? DEVICE[cafeDevice(cafe.slug)] : null;
  const triad = cafe && layers.initials ? coinInitials(cafe) : null;
  const showLegend = layers.legend && (Platform.OS !== "android" || RIM_LEGEND_ON_ANDROID);
  const legend = showLegend ? (cafe ? coinLegend(cafe.name, cafe.district, C.rim.maxChars) : C.generic.legend) : null;
  const pT = layers.pTransform;

  return (
    <Svg width={size} height={size} viewBox={C.viewBox}>
      <Defs>
        <RadialGradient id={`${id}-face`} cx={C.gradient.cx} cy={C.gradient.cy} r={C.gradient.r}>
          {C.gradient.stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </RadialGradient>
        {legend ? <Path id={`${id}-rim`} d={C.rim.d} fill="none" /> : null}
      </Defs>

      <Circle cx={C.face.cx} cy={C.face.cy} r={C.face.r} fill={`url(#${id}-face)`} />
      {/* Dark theme only: the edge holds against the dark page (3.45:1). */}
      {isDark(t) ? (
        <Circle
          cx={C.darkRing.cx}
          cy={C.darkRing.cy}
          r={C.darkRing.r}
          fill="none"
          stroke={C.darkRing.stroke}
          strokeOpacity={C.darkRing.strokeOpacity}
          strokeWidth={C.darkRing.strokeWidth}
        />
      ) : null}

      {layers.beads ? (
        <G fill={C.beads.fill}>
          {BEADS.map((b, i) => (
            <Circle key={i} cx={b.cx} cy={b.cy} r={C.beads.r} />
          ))}
        </G>
      ) : null}
      {layers.hairline ? (
        <Circle
          cx={C.hairline.cx}
          cy={C.hairline.cy}
          r={C.hairline.r}
          fill="none"
          stroke={C.hairline.stroke}
          strokeWidth={C.hairline.strokeWidth}
        />
      ) : null}

      {layers.band ? (
        <G fill="none">
          <Circle cx={C.band.ring.cx} cy={C.band.ring.cy} r={C.band.ring.r} stroke={C.band.ring.stroke} strokeWidth={C.band.ring.strokeWidth} />
          <Circle cx={C.band.outer.cx} cy={C.band.outer.cy} r={C.band.outer.r} stroke={C.band.outer.stroke} strokeWidth={C.band.outer.strokeWidth} />
          <Circle cx={C.band.inner.cx} cy={C.band.inner.cy} r={C.band.inner.r} stroke={C.band.inner.stroke} strokeWidth={C.band.inner.strokeWidth} />
        </G>
      ) : null}
      {legend ? (
        <SvgText
          fontFamily={FAMILY.narrow}
          fontSize={C.rim.fontSize}
          letterSpacing={C.rim.letterSpacing}
          fill={C.rim.fill}
          textAnchor="middle"
        >
          <TextPath href={`#${id}-rim`} startOffset={C.rim.startOffset}>
            {legend}
          </TextPath>
        </SvgText>
      ) : null}

      {layers.p ? (
        <G fillRule={C.p.fillRule} transform={pT && pT.scale !== 1 ? pT.transform : undefined}>
          <Path
            d={C.p.d}
            transform={`translate(${C.p.highlight.dx} ${C.p.highlight.dy})`}
            fill={C.p.highlight.fill}
            fillOpacity={C.p.highlight.fillOpacity}
          />
          <Path d={C.p.d} fill={C.p.fill} />
        </G>
      ) : null}

      {device && layers.deviceTransform ? (
        <G
          transform={layers.deviceTransform.transform}
          fill="none"
          strokeWidth={C.device.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path
            d={device}
            stroke={C.device.highlight.stroke}
            strokeOpacity={C.device.highlight.strokeOpacity}
            transform={`translate(${C.device.highlight.dx} ${C.device.highlight.dy})`}
          />
          <Path d={device} stroke={C.device.stroke} />
        </G>
      ) : null}
      {triad && layers.initialsAt ? (
        <G fill={C.initials.fill}>
          <SvgText
            x={32}
            y={layers.initialsAt.topY}
            textAnchor="middle"
            fontFamily={FAMILY.display}
            fontSize={layers.initialsAt.topSize}
          >
            {triad.top}
          </SvgText>
          {triad.bottom ? (
            <SvgText
              x={32}
              y={layers.initialsAt.bottomY}
              textAnchor="middle"
              fontFamily={FAMILY.sans}
              fontSize={layers.initialsAt.bottomSize}
              letterSpacing={C.initials.bottom.letterSpacing}
            >
              {triad.bottom}
            </SvgText>
          ) : null}
        </G>
      ) : null}

      {face === "back" ? (
        <G fill={C.back.fill}>
          <SvgText
            x={C.back.value.x}
            y={C.back.value.y}
            textAnchor="middle"
            fontFamily={FAMILY.display}
            fontSize={C.back.value.fontSize}
          >
            {backLabel ?? C.back.value.fallback}
          </SvgText>
          <SvgText
            x={C.back.label.x}
            y={C.back.label.y}
            textAnchor="middle"
            fontFamily={FAMILY.narrow}
            fontSize={C.back.label.fontSize}
            letterSpacing={C.back.label.letterSpacing}
          >
            {C.back.label.text}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
});
