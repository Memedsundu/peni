/**
 * The Peni kodu as a QR code (design-system.md §9.6, §10.6): generated with `uqr` (ecc M,
 * quiet zone 4), drawn with react-native-svg `Rect`s, one per horizontal run of dark modules.
 *
 * Light-theme `ink` modules on white in BOTH themes: a scanner needs dark on light, and the dark
 * theme's cream ink would not scan. The drawn size is snapped down to a whole number of points
 * per module, so no hairline seams open between rows.
 *
 * Decorative for screen readers: the code itself is printed as text right under it.
 */
import { light } from "@peni/brand/tokens";
import { memo, useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { encode } from "uqr";

/** Pure white paper for the code (light `onPeni`), in both themes. */
const QR_PAPER = light.onPeni;
const QR_INK = light.ink;

export const QrCode = memo(function QrCode({
  value,
  size = 240,
  style,
}: {
  value: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { runs, n } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 });
    const out: { x: number; y: number; w: number }[] = [];
    qr.data.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x++;
        out.push({ x: start, y, w: x - start });
      }
    });
    return { runs: out, n: qr.size };
  }, [value]);

  const px = Math.max(n, Math.floor(size / n) * n);

  return (
    <View aria-hidden accessible={false} pointerEvents="none" style={[{ width: px, height: px }, style]}>
      <Svg width={px} height={px} viewBox={`0 0 ${n} ${n}`}>
        <Rect x={0} y={0} width={n} height={n} fill={QR_PAPER} />
        {runs.map((r) => (
          <Rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={QR_INK} />
        ))}
      </Svg>
    </View>
  );
});
