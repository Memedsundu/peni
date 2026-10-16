/**
 * `durdur` sheet (design-system.md §9.10 pause sheet, §10.10; formSheet, "fitToContents"),
 * opened from the Tezgâh pause pill.
 *
 * - "Uygulama siparişlerini durdur" · "Ne kadar durduralım?" with "15 dakika", "30 dakika" and
 *   "Gün sonuna kadar" — each resumes by itself [G20], and each option is the action (no
 *   second confirm).
 * - While paused, the sheet says so ("Uygulama siparişleri durdu · 12 dk kaldı") and offers
 *   "Şimdi aç"; picking a duration then replaces the current one.
 * - Errors toast "Değiştirilemedi. Tekrar dene." and the sheet stays for another try.
 */
import type { PauseDuration } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { router, Stack } from "expo-router";
import { CirclePause, CirclePlay } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SheetFrame } from "@/components/cafe/sheet";
import { pausedBannerText, setPause, useBoard, useNow } from "@/components/staff";
import { Banner, Button, toast } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";

/** "15 dakika", "30 dakika", "Gün sonuna kadar" [G20]. */
const OPTIONS: { label: string; value: PauseDuration }[] = [
  { label: staffCopy.pauseSheet.options[0], value: { minutes: 15 } },
  { label: staffCopy.pauseSheet.options[1], value: { minutes: 30 } },
  { label: staffCopy.pauseSheet.options[2], value: "end_of_day" },
];

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
          {paused ? <Banner tone="warning" icon={CirclePause} title={pausedBannerText(until, Math.max(now, Date.now()))} /> : null}
          <View style={styles.options}>
            {OPTIONS.map((o) => (
              <Button
                key={o.label}
                title={o.label}
                variant="secondary"
                size="lg"
                fullWidth
                loading={busy === o.label}
                loadingLabel={o.label}
                onPress={() => void choose(o.label, o.value)}
              />
            ))}
          </View>
        </View>
      </SheetFrame>
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  options: { gap: 8 },
});
