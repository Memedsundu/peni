"use client";

import type { PauseDuration } from "@peni/api";
import { staffCopy } from "@peni/brand/copy";
import { CirclePause, CirclePlay } from "lucide-react";
import { useEffect, useState } from "react";
import type { PauseState } from "@/components/chrome/press-header";
import { Banner, Button, Sheet } from "@/components/ui";
import { pausedBannerText } from "./model";

/** "15 dakika", "30 dakika", "Gün sonuna kadar" [G20]. */
const OPTIONS: { label: string; value: PauseDuration }[] = [
  { label: staffCopy.pauseSheet.options[0], value: { minutes: 15 } },
  { label: staffCopy.pauseSheet.options[1], value: { minutes: 30 } },
  { label: staffCopy.pauseSheet.options[2], value: "end_of_day" },
];

/** Re-renders every 15s, so countdowns stay within a minute. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Pause sheet (design-system.md §9.10): "Uygulama siparişlerini durdur" · "Ne kadar
 * durduralım?" with three durations that resume by themselves [G20]. Each option is the action
 * (no second confirm). While paused, the sheet says so and offers "Şimdi aç"; picking a
 * duration then replaces the current one.
 */
export function PauseSheet({
  open,
  onOpenChange,
  pause,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pause: PauseState | null;
  /** A duration pauses; null resumes. Resolves when saved, rejects on failure (the caller toasts). */
  onChoose: (value: PauseDuration | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const paused = pause?.paused ?? false;

  const choose = async (key: string, value: PauseDuration | null) => {
    if (busy) return;
    setBusy(key);
    try {
      await onChoose(value);
      onOpenChange(false);
    } catch {
      // The caller showed "Değiştirilemedi. Tekrar dene."; the sheet stays for another try.
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={staffCopy.pauseSheet.title}
      description={staffCopy.pauseSheet.question}
      footer={
        paused ? (
          <Button size="lg" fullWidth iconStart={CirclePlay} loading={busy === "resume"} onClick={() => choose("resume", null)}>
            {staffCopy.resume}
          </Button>
        ) : undefined
      }
    >
      {paused && <Banner tone="warning" icon={CirclePause} title={pausedBannerText(pause?.pausedUntil, Math.max(now, Date.now()))} className="mb-4" />}
      <div className="flex flex-col gap-2 pb-1">
        {OPTIONS.map((o) => (
          <Button
            key={o.label}
            variant="secondary"
            size="lg"
            fullWidth
            loading={busy === o.label}
            onClick={() => choose(o.label, o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}
