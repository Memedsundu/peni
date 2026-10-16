/**
 * The new-order chime in the browser preview (react-native-web): the web panel's WebAudio
 * chime (§9.10 — sine 880Hz for 120ms, then 1320Hz for 180ms, gain 0.25, 10ms attack, 120ms
 * release), so no native audio module is loaded. Browsers keep audio locked until a tap; a
 * locked or missing AudioContext plays nothing and never throws.
 */
import { useCallback, useEffect, useRef } from "react";

type Ctx = AudioContext;

function tone(ctx: Ctx, freq: number, start: number, length: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
  gain.gain.setValueAtTime(0.25, start + Math.max(0.01, length - 0.12));
  gain.gain.linearRampToValueAtTime(0, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

export function useNewOrderChime(): () => void {
  const ctx = useRef<Ctx | null>(null);

  // The first tap anywhere unlocks audio for the shift.
  useEffect(() => {
    const unlock = () => {
      try {
        const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx.current ??= new Ctor();
        if (ctx.current.state === "suspended") void ctx.current.resume().catch(() => {});
      } catch {
        // No audio here.
      }
    };
    globalThis.addEventListener?.("pointerdown", unlock, { passive: true });
    return () => {
      globalThis.removeEventListener?.("pointerdown", unlock);
      void ctx.current?.close().catch(() => {});
      ctx.current = null;
    };
  }, []);

  return useCallback(() => {
    const c = ctx.current;
    if (!c || c.state !== "running") return;
    try {
      const at = c.currentTime + 0.01;
      tone(c, 880, at, 0.12);
      tone(c, 1320, at + 0.12, 0.18);
    } catch {
      // Ignore: the badge and the bar still tell.
    }
  }, []);
}
