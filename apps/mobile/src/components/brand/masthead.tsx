/**
 * Manşet, the café masthead (design-system.md §6.4), in this order:
 * Oxford rule · 12 · café name · 8 · ink rule · 6 · dateline
 * "MODA KAHVESİ GAZETESİ · 16 EKİM 2026 · KADIKÖY" (`plate`, `ink2`) · optional greeting
 * "Günaydın Ayşe." (`body`, `ink2`).
 *
 * The café name is the screen's top heading. Mobile's type scale (§4.5) has no h1, so it is set
 * like the large title (Brygada 600 34), the biggest display size the app uses.
 *
 * `compact` (top of Masa): no Oxford rule and no name; the ink rule and the dateline
 * "MODA KAHVESİ GAZETESİ · 16 EKİM 2026" only.
 */
import { dateline, SEP } from "@peni/brand/format";
import { memo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/ui";
import { fonts } from "@/lib/theme";
import { InkRule, OxfordRule } from "./rules";

export interface MastheadProps {
  cafe: { name: string; district?: string | null };
  /** The paper's date: today (read in Istanbul time). */
  date: Date | string;
  /** The full sentence, e.g. `${greeting(now)} ${firstName}.` */
  greeting?: string | null;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The dot stays with the word before it, so a wrapped dateline never starts with "·". */
const NBSP_SEP = SEP.replace(/^ /, "\u00A0");

const NAME = { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 } as const;

export const Masthead = memo(function Masthead({ cafe, date, greeting, compact = false, style }: MastheadProps) {
  const line = dateline(cafe, date, { compact }).split(SEP).join(NBSP_SEP);
  if (compact) {
    return (
      <View style={style}>
        <InkRule />
        <T variant="plate" color="ink2" style={{ marginTop: 6 }}>
          {line}
        </T>
      </View>
    );
  }
  return (
    <View style={style}>
      <OxfordRule />
      <T accessibilityRole="header" maxFontSizeMultiplier={1.3} style={[NAME, { marginTop: 12 }]}>
        {cafe.name}
      </T>
      <InkRule style={{ marginTop: 8 }} />
      <T variant="plate" color="ink2" style={{ marginTop: 6 }}>
        {line}
      </T>
      {greeting ? (
        <T variant="body" color="ink2" style={{ marginTop: 8 }}>
          {greeting}
        </T>
      ) : null}
    </View>
  );
});
