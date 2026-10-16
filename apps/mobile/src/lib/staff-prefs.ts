/**
 * Kafe modu preferences. "Ses" (Ayarlar, §10.10): the new-order chime; when off, Tezgâh shows
 * the "Ses kapalı" banner. Stored in SecureStore like the other device settings.
 */
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

export const SOUND_KEY = "peni.staffSound";

let soundOn = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

storage
  .get(SOUND_KEY)
  .then((v) => {
    soundOn = v !== "off";
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
