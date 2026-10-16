/**
 * `durdur` sheet (design-system.md §9.10 pause sheet, §10.10; formSheet, "fitToContents"),
 * opened from the Tezgâh pause pill.
 *
 *   Uygulama siparişlerini durdur                      [×]
 *   Ne kadar durduralım?
 *   [Uygulama siparişleri durdu · 12 dk kaldı]          only while paused
 *   ┌ 15 dakika                    21:56'da açılır ┐
 *   ┌ 30 dakika                    22:11'de açılır ┐
 *   ┌ Gün sonuna kadar             00:00'da açılır ┐
 *   [            ▷ Şimdi aç (primary)           ]      only while paused
 *
 * - Each option is the action (no second confirm) and resumes by itself [G20]; the time it
 *   reopens is written beside it, from this minute, so nobody has to do the sum at the counter.
 * - While paused, the sheet says so and offers "Şimdi aç"; picking a duration replaces the
 *   current one.
 * - Errors toast "Değiştirilemedi. Tekrar dene." and the sheet stays for another try.
 */
import type { PauseDuration } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { locativeTime } from "@peni/brand/format";
import { router, Stack } from "expo-router";
import { CirclePause, CirclePlay } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SheetFrame } from "@/components/cafe/sheet";
import { pausedBannerText, setPause, useBoard, useNow } from "@/components/staff";
import { Banner, Button, PressableScale, Spinner, T, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { radius, useTokens } from "@/lib/theme";

const MINUTE = 60_000;

/** "15 dakika", "30 dakika", "Gün sonuna kadar" [G20], with when each one reopens. */
const OPTIONS: { label: string; value: PauseDuration; until: (now: number) => Date }[] = [
  { label: staffCopy.pauseSheet.options[0], value: { minutes: 15 }, until: (now) => new Date(now + 15 * MINUTE) },
  { label: staffCopy.pauseSheet.options[1], value: { minutes: 30 }, until: (now) => new Date(now + 30 * MINUTE) },
  { label: staffCopy.pauseSheet.options[2], value: "end_of_day", until: nextMidnight },
];

const DAY = 24 * 60 * MINUTE;
/** The cafés' time zone (`TIME_ZONE`, Europe/Istanbul) is UTC+3 all year (no DST since 2016). */
const ISTANBUL_OFFSET = 3 * 60 * MINUTE;

/** The start of the next day in Istanbul — where the server ends "Gün sonuna kadar". */
function nextMidnight(now: number): Date {
  const local = now + ISTANBUL_OFFSET;
  return new Date(local - (local % DAY) + DAY - ISTANBUL_OFFSET);
}

/** "21:56'da açılır". */
function reopensAt(date: Date): string {
  return `${locativeTime(date)} açılır`;
}

const RESUME = "resume";

export default function DurdurSheet() {
  const { api } = useSession();
  const { slug, data } = useBoard();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  // Frozen while a change is out and the sheet closes, so it doesn't redraw itself on the way out.
  const kept = useRef({ paused: data?.cafe.appOrderingPaused ?? false, until: data?.cafe.pausedUntil ?? null });
  if (busy == null) kept.current = { paused: data?.cafe.appOrderingPaused ?? false, until: data?.cafe.pausedUntil ?? null };
  const { paused, until } = kept.current;
  const at = Math.max(now, Date.now());

  const choose = async (key: string, value: PauseDuration | null) => {
    if (busy || !slug) return;
    setBusy(key);
    try {
      await setPause(api, slug, value);
      haptic("confirm");
      router.back();
    } catch {
      haptic("error");
      toast(errorCopy.change, { tone: "danger" });
      setBusy(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: busy == null }} />
      <SheetFrame
        title={staffCopy.pauseSheet.title}
        description={staffCopy.pauseSheet.question}
        closeDisabled={busy != null}
        footer={
          paused ? (
            <Button
              title={staffCopy.resume}
              icon={CirclePlay}
              size="lg"
              fullWidth
              loading={busy === RESUME}
              loadingLabel={staffCopy.resume}
              onPress={() => void choose(RESUME, null)}
            />
          ) : undefined
        }
      >
        <View style={styles.body}>
          {paused ? <Banner tone="warning" icon={CirclePause} title={pausedBannerText(until, at)} /> : null}
          <View role="list" style={styles.options}>
            {OPTIONS.map((o) => (
              <PauseOption
                key={o.label}
                label={o.label}
                detail={reopensAt(o.until(at))}
                busy={busy === o.label}
                onPress={() => void choose(o.label, o.value)}
              />
            ))}
          </View>
        </View>
      </SheetFrame>
    </>
  );
}

/**
 * One duration: a 56pt secondary row (surface, 1.5pt `lineStrong`, radius 10) with the label
 * on the left and, on the right in `meta ink2`, when orders reopen. In flight, the time gives
 * way to the spinner; the row keeps its look (never faded).
 */
function PauseOption({ label, detail, busy, onPress }: { label: string; detail: string; busy: boolean; onPress: () => void }) {
  const t = useTokens();
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      pressedColor={t.surface2}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${detail}`}
      accessibilityState={{ busy }}
      style={[styles.option, { backgroundColor: t.surface, borderColor: t.lineStrong }]}
    >
      <T variant="button" style={styles.optionLabel}>
        {label}
      </T>
      {busy ? (
        <Spinner color={t.ink} />
      ) : (
        <T variant="meta" color="ink2" tabular>
          {detail}
        </T>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  options: { gap: 8 },
  option: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.control,
    borderWidth: 1.5,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    // One line of label and time, centred in the 56pt row; at large text sizes the time wraps under.
    alignContent: "center",
    justifyContent: "space-between",
    columnGap: 12,
    rowGap: 2,
  },
  optionLabel: { flexShrink: 1 },
});
