/**
 * Date block (design-system.md §6.5): a vişne plate for Peni masası dates, "PER" · "22" ·
 * "EKİ". md 56×64, sm 40×48, radius 4. The time never goes inside it: put "19:00" beside it in
 * `T variant="item" tabular`.
 *
 * Read as one date ("22 Ekim Perşembe"), never as three abbreviations. The plate is a fixed
 * size, so its own text grows only a little with Dynamic Type (the label carries the date).
 */
import { dateBlock, TIME_ZONE } from "@peni/brand/format";
import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { T } from "@/components/ui";
import { fonts, radius, useTokens } from "@/lib/theme";

export interface DateBlockProps {
  date: Date | string;
  size?: "md" | "sm";
  style?: StyleProp<ViewStyle>;
}

let spokenFmt: Intl.DateTimeFormat | null = null;
function spoken(date: Date): string {
  try {
    spokenFmt ??= new Intl.DateTimeFormat("tr-TR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
    return spokenFmt.format(date);
  } catch {
    return date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  }
}

/** The plate is a fixed box: its text may grow this much, no more. */
const MAX_SCALE = 1.1;

const SIZES = {
  md: { width: 56, height: 64, day: 26, dayLine: 28, plateLine: 14 },
  sm: { width: 40, height: 48, day: 18, dayLine: 20, plateLine: 13 },
} as const;

export const DateBlock = memo(function DateBlock({ date, size = "md", style }: DateBlockProps) {
  const t = useTokens();
  const d = new Date(date);
  const parts = dateBlock(d);
  const s = SIZES[size];
  const plate = { lineHeight: s.plateLine };
  return (
    <View
      accessible
      accessibilityLabel={spoken(d)}
      style={[styles.block, { width: s.width, height: s.height, backgroundColor: t.masa }, style]}
    >
      <T variant="plate" color="onMasa" align="center" style={plate} maxFontSizeMultiplier={MAX_SCALE}>
        {parts.weekday}
      </T>
      <T
        color="onMasa"
        align="center"
        maxFontSizeMultiplier={MAX_SCALE}
        style={{ fontFamily: fonts.display, fontSize: s.day, lineHeight: s.dayLine, fontVariant: ["lining-nums", "tabular-nums"] }}
      >
        {parts.day}
      </T>
      <T variant="plate" color="onMasa" align="center" style={plate} maxFontSizeMultiplier={MAX_SCALE}>
        {parts.month}
      </T>
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    borderRadius: radius.tag,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
