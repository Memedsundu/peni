"use client";

import { useSyncExternalStore } from "react";

/*
 * The new-order chime (design-system.md §9.10, §15 "Sound"), played with WebAudio:
 * a sine at 880Hz for 120ms, then 1320Hz for 180ms, gain .25 with a 10ms attack and a
 * 120ms release. Browsers only let a page make sound after a tap, so the AudioContext is
 * created and resumed inside a user gesture (`unlockAudio()`): the shift-start button, "Sesi
 * aç", the header's sound toggle, or the first tap anywhere on the board after a reload.
 *
 * One context per tab, shared by the header and the board through `useAudioReady()`.
 */

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** True once the context runs: a chime played now would be heard. */
export function audioReady(): boolean {
  return ctx?.state === "running";
}

/**
 * Call synchronously inside a click or key handler. Creates or resumes the context and plays
 * one silent sample (iOS only counts a sound started inside the gesture). Resolves to whether
 * sound can play now.
 */
export function unlockAudio(): Promise<boolean> {
  const AC = ctor();
  if (!AC) return Promise.resolve(false);
  try {
    if (!ctx) {
      ctx = new AC();
      ctx.addEventListener("statechange", emit);
    }
    const silent = ctx.createBuffer(1, 1, 22_050);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
    const resumed = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    return resumed.then(
      () => {
        emit();
        return audioReady();
      },
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** The chime. Plays only when the context is running; returns whether it did. */
export function playChime(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const t0 = ctx.currentTime + 0.01;
  tone(ctx, 880, t0, 0.12);
  tone(ctx, 1320, t0 + 0.12, 0.18);
  return true;
}

/** One sine note: 10ms attack to .25, held, then a 120ms release that ends with the note. */
function tone(ac: AudioContext, freq: number, start: number, duration: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, start);
  const end = start + duration;
  const releaseAt = Math.max(start + 0.01, end - 0.12);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
  gain.gain.setValueAtTime(0.25, releaseAt);
  gain.gain.linearRampToValueAtTime(0, end);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Whether the chime can be heard right now (re-renders when the context starts or stops). */
export function useAudioReady(): boolean {
  return useSyncExternalStore(subscribe, audioReady, () => false);
}
