/**
 * Café cover (design-system.md §6.4, §10.2). card: 16/7 with 14pt top corners. hero: 200pt tall
 * (§10.2), 14pt corners, or full-bleed under the café screen's transparent header (`bleed`).
 *
 * With a photo: `expo-image`, covering, `transition={200}` (none under reduced motion), no
 * alt text, on a 4pt colourway bottom edge. Without one, a deterministic plate: the café
 * colourway with its device tiled in cream at 16% (react-native-svg `Pattern`). In dark mode
 * the cover carries the 1px plate ring.
 *
 * The cover is the shared element of the card → café zoom on iOS: wrap it in
 * `Link.AppleZoom` / `Link.AppleZoomTarget` at the screen. Decorative: hidden from readers.
 */
import { cafeDevice } from "@peni/brand/format";
import { COVER_PATTERN, DEVICE } from "@peni/brand/shapes";
import type { CafeHue } from "@peni/brand/tokens";
import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from "react-native-svg";
import { durations, useMotionReduced } from "@/lib/motion";
import { radius, useTokens } from "@/lib/theme";
import { hidden, useSvgId } from "./_internal";
import { hueColor, plateRingStyle } from "./cafe-hue-band";

export interface CafeCoverCafe {
  slug: string;
  name: string;
  coverImageUrl: string | null;
  hue?: CafeHue | null;
}

export interface CafeCoverProps {
  cafe: CafeCoverCafe;
  size: "card" | "hero";
  /** Hero only: its height in pt. Default 200. */
  height?: number;
  /** Hero only: full-bleed (no corners), for the top of the café screen. */
  bleed?: boolean;
  /**
   * Hero only: the 96pt scrim under a transparent header (§10.2), black .45 → 0, so the white
   * back button reads on any photo or plate.
   */
  scrim?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HERO_HEIGHT = 200;
const SCRIM_HEIGHT = 96;
/** The photo sits on a 4pt colourway edge. */
const PHOTO_EDGE = 4;

export const CafeCover = memo(function CafeCover({ cafe, size, height = HERO_HEIGHT, bleed = false, scrim = false, style }: CafeCoverProps) {
  const t = useTokens();
  const reduced = useMotionReduced();
  const id = useSvgId("cover");
  const hue = hueColor(cafe.slug, cafe.hue);
  const device = DEVICE[cafeDevice(cafe.slug)];
  const P = COVER_PATTERN;
  const hero = size === "hero";

  const corners: ViewStyle = hero
    ? { borderRadius: bleed ? 0 : radius.card }
    : { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card };
  const shape: ViewStyle = hero ? { height, ...corners } : { aspectRatio: 16 / 7, ...corners };

  return (
    // The ring is an outset shadow, so it sits on an outer box that does not clip.
    <View {...hidden} pointerEvents="none" style={[shape, bleed ? null : plateRingStyle(t), style]}>
      <View style={[StyleSheet.absoluteFill, corners, styles.clip, { backgroundColor: hue }]}>
        {cafe.coverImageUrl ? (
          <>
            <Image
              source={{ uri: cafe.coverImageUrl }}
              alt=""
              accessible={false}
              contentFit="cover"
              transition={reduced ? null : durations.ui}
              style={StyleSheet.absoluteFill}
            />
            <View style={[styles.edge, { backgroundColor: hue }]} />
          </>
        ) : (
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id={id} width={P.size} height={P.size} patternUnits="userSpaceOnUse">
                <G
                  fill="none"
                  stroke={P.stroke}
                  strokeOpacity={P.strokeOpacity}
                  strokeWidth={P.strokeWidth}
                  strokeLinecap={P.strokeLinecap}
                  strokeLinejoin={P.strokeLinejoin}
                >
                  {P.offsets.map((o) => (
                    <Path key={o.transform} d={device} transform={o.transform} />
                  ))}
                </G>
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={hue} />
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
        )}
        {hero && scrim ? (
          <Svg width="100%" height={SCRIM_HEIGHT} style={styles.scrim}>
            <Defs>
              <LinearGradient id={`${id}-scrim`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="black" stopOpacity={0.45} />
                <Stop offset="1" stopColor="black" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id}-scrim)`} />
          </Svg>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  edge: { position: "absolute", left: 0, right: 0, bottom: 0, height: PHOTO_EDGE },
  scrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
