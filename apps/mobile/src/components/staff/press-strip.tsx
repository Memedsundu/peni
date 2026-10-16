/**
 * The Tezgâh header's subtitle row (design-system.md §10.10, §8.3): the live clock and the
 * pause pill, on press.
 *
 * - Clock: `HH:MM` in Istanbul time, tabular, `onPress2`, ticking on the minute.
 * - Pause pill (`PressableScale` → the `durdur` sheet): "Uygulama siparişleri: Açık" with a
 *   success dot, or "Uygulama siparişleri: Durdu" with `CirclePause` on a warning plate. Status
 *   colours on press use their dark-theme values (press is dark in both themes), as on the web.
 *   36pt tall with a 4pt hit slop (44pt target).
 */
import { staffCopy } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { dark } from "@peni/brand/tokens";
import { router } from "expo-router";
import { ChevronDown, CirclePause } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Icon, PressableScale, T, withAlpha } from "@/components/ui";
import { fonts, radius, useTokens } from "@/lib/theme";

/** Live `HH:MM`, ticking on the minute. */
export function PressClock() {
  const t = useTokens();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    const timeout = setTimeout(
      () => {
        tick();
        interval = setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000) + 50,
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  const time = formatTime(now);
  return (
    <T variant="body" tabular accessibilityLabel={`Saat ${time}`} style={{ color: t.onPress2 }}>
      {time}
    </T>
  );
}

export function PausePill({ paused }: { paused: boolean }) {
  const t = useTokens();
  const label = paused ? staffCopy.ordersPaused : staffCopy.ordersOpen;
  const fg = paused ? dark.warningInk : t.onPress;
  return (
    <PressableScale
      onPress={() => router.push("/durdur")}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={staffCopy.pauseSheet.title}
      hitSlop={4}
      pressedColor={paused ? withAlpha(dark.warningSoft, 0.85) : withAlpha(t.onPress, 0.1)}
      style={[
        styles.pill,
        paused
          ? { backgroundColor: dark.warningSoft, borderColor: dark.warningSoft }
          : { borderColor: withAlpha(t.onPress2, 0.45) },
      ]}
    >
      {paused ? (
        <Icon icon={CirclePause} size={16} color={fg} />
      ) : (
        <View aria-hidden style={[styles.dot, { backgroundColor: dark.success }]} />
      )}
      <T variant="meta" numberOfLines={1} style={[styles.pillText, { color: fg }]}>
        {label}
      </T>
      <Icon icon={ChevronDown} size={16} color={paused ? fg : t.onPress2} />
    </PressableScale>
  );
}

/** Clock left, pill right; at large text sizes the pill drops under the clock. */
export function TezgahStrip({ paused }: { paused: boolean | null }) {
  return (
    <View style={styles.row}>
      <PressClock />
      {paused != null ? <PausePill paused={paused} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 12,
    rowGap: 8,
  },
  pill: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: radius.control,
    borderWidth: 1.5,
    flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  pillText: { fontFamily: fonts.sansSemiBold, flexShrink: 1 },
});
