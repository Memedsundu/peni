/**
 * Kafe modu preferences, stored on the device like the other settings.
 *
 * - "Ses" (Ayarlar, §10.10): the new-order chime; when off, Tezgâh shows the "Ses kapalı" banner.
 * - What each staff café was last seen as — its name and its colourway [G9] — so Tezgâh's large
 *   title and the press band are right from the first frame of the next launch, instead of
 *   switching from "Tezgâh" and the fallback colourway once the board and the café load.
 */
import type { CafeHue } from "@peni/brand/tokens";
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export const SOUND_KEY = "peni.staffSound";
export const CAFES_KEY = "peni.staffCafes";
/** Names only, from before the colourway was remembered too; read once and folded in. */
const LEGACY_NAMES_KEY = "peni.staffCafeNames";

export interface RememberedCafe {
  name?: string;
  /** The café's own colourway; null when it hasn't chosen one (then `cafeHue(slug)`). */
  hue?: CafeHue | null;
}

let soundOn = true;
let cafes: Record<string, RememberedCafe> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

storage
  .get(SOUND_KEY)
  .then((v) => {
    soundOn = v !== "off";
    emit();
  })
  .catch(() => {});

function parse(v: string | null): Record<string, unknown> | null {
  if (!v) return null;
  try {
    const parsed: unknown = JSON.parse(v);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

Promise.all([storage.get(CAFES_KEY).catch(() => null), storage.get(LEGACY_NAMES_KEY).catch(() => null)])
  .then(([stored, legacy]) => {
    const read: Record<string, RememberedCafe> = {};
    for (const [slug, name] of Object.entries(parse(legacy) ?? {})) if (typeof name === "string") read[slug] = { name };
    for (const [slug, value] of Object.entries(parse(stored) ?? {})) {
      if (value && typeof value === "object") read[slug] = { ...read[slug], ...(value as RememberedCafe) };
    }
    if (Object.keys(read).length === 0) return;
    // Anything learned this session (the board answered first) wins over what was stored.
    const merged: Record<string, RememberedCafe> = { ...read };
    for (const [slug, value] of Object.entries(cafes)) merged[slug] = { ...read[slug], ...value };
    cafes = merged;
    emit();
  })
  .catch(() => {});

export function staffSoundEnabled(): boolean {
  return soundOn;
}

export async function setStaffSoundEnabled(on: boolean): Promise<void> {
  soundOn = on;
  emit();
  try {
    await storage.set(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; applies for this session.
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** `[on, setOn]` for the Ayarlar "Ses" switch and the Tezgâh banner. */
export function useStaffSound(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => soundOn,
    () => soundOn,
  );
  return [on, (next: boolean) => void setStaffSoundEnabled(next)];
}

/** Remembers what the board or the café page said about this café (written only when it changed). */
export function rememberCafe(slug: string, next: RememberedCafe): void {
  if (!slug) return;
  const current = cafes[slug] ?? {};
  const merged: RememberedCafe = { ...current };
  if (next.name) merged.name = next.name;
  if (next.hue !== undefined) merged.hue = next.hue;
  if (merged.name === current.name && merged.hue === current.hue) return;
  cafes = { ...cafes, [slug]: merged };
  emit();
  storage.set(CAFES_KEY, JSON.stringify(cafes)).catch(() => {});
}

/** The café as last seen on this device (`{}` when never seen). */
export function useRememberedCafe(slug: string | null | undefined): RememberedCafe {
  const all = useSyncExternalStore(
    subscribe,
    () => cafes,
    () => cafes,
  );
  return (slug ? all[slug] : undefined) ?? EMPTY;
}

const EMPTY: RememberedCafe = {};

/** The café's name as last seen on this device, or null. */
export function useRememberedCafeName(slug: string | null | undefined): string | null {
  return useRememberedCafe(slug).name ?? null;
}
