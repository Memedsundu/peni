/**
 * Kafe modu preferences, stored on the device like the other settings.
 *
 * - "Ses" (Ayarlar, §10.10): the new-order chime; when off, Tezgâh shows the "Ses kapalı" banner.
 * - The last name seen for each staff café, so Tezgâh's large title is the café name from the
 *   first frame of the next launch instead of switching from "Tezgâh" once the board loads.
 */
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export const SOUND_KEY = "peni.staffSound";
export const CAFE_NAMES_KEY = "peni.staffCafeNames";

let soundOn = true;
let cafeNames: Record<string, string> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

storage
  .get(SOUND_KEY)
  .then((v) => {
    soundOn = v !== "off";
    emit();
  })
  .catch(() => {});

storage
  .get(CAFE_NAMES_KEY)
  .then((v) => {
    if (!v) return;
    const parsed: unknown = JSON.parse(v);
    if (parsed && typeof parsed === "object") {
      cafeNames = { ...(parsed as Record<string, string>), ...cafeNames };
      emit();
    }
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

/** Remembers what the board called this café (only when it changed). */
export function rememberCafeName(slug: string, name: string): void {
  if (!slug || !name || cafeNames[slug] === name) return;
  cafeNames = { ...cafeNames, [slug]: name };
  emit();
  storage.set(CAFE_NAMES_KEY, JSON.stringify(cafeNames)).catch(() => {});
}

/** The café's name as last seen on this device, or null. */
export function useRememberedCafeName(slug: string | null | undefined): string | null {
  const names = useSyncExternalStore(
    subscribe,
    () => cafeNames,
    () => cafeNames,
  );
  return slug ? (names[slug] ?? null) : null;
}
