/**
 * Haptics (design-system.md §7.3). `haptic(intent)` does nothing on web or when "Titreşim" is
 * off in Profil, and swallows every rejection: a missing motor must never break a tap.
 */
import * as Haptics from "expo-haptics";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { storage } from "./storage";

export type HapticIntent = "tap" | "selection" | "confirm" | "success" | "warning" | "error";

/** SecureStore key for the "Titreşim" switch: "on" | "off" (absent = on). */
export const HAPTICS_KEY = "peni.haptics";

const ANDROID: Record<HapticIntent, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Context_Click,
  selection: Haptics.AndroidHaptics.Segment_Tick,
  confirm: Haptics.AndroidHaptics.Confirm,
  success: Haptics.AndroidHaptics.Confirm,
  warning: Haptics.AndroidHaptics.Reject,
  error: Haptics.AndroidHaptics.Reject,
};

function play(intent: HapticIntent): Promise<void> {
  if (Platform.OS === "android") return Haptics.performAndroidHapticsAsync(ANDROID[intent]);
  switch (intent) {
    case "tap":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case "selection":
      return Haptics.selectionAsync();
    case "confirm":
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case "success":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case "warning":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case "error":
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/* ---------------------------------------------------------------------------------------- */
/* The "Titreşim" preference: one module-level value, read by haptic() synchronously.        */
/* ---------------------------------------------------------------------------------------- */

let enabled = true;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Reads the stored preference once at startup. Until it resolves, haptics stay on. */
const loaded: Promise<boolean> =
  Platform.OS === "web"
    ? Promise.resolve(false)
    : storage
        .get(HAPTICS_KEY)
        .then((v) => {
          enabled = v !== "off";
          emit();
          return enabled;
        })
        .catch(() => enabled);

/** Resolves once the stored preference is read. */
export function hapticsReady(): Promise<boolean> {
  return loaded;
}

export function hapticsEnabled(): boolean {
  return Platform.OS !== "web" && enabled;
}

/** Turns "Titreşim" on or off and remembers it in SecureStore. */
export async function setHapticsEnabled(on: boolean): Promise<void> {
  enabled = on;
  emit();
  try {
    await storage.set(HAPTICS_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; the switch still works for this session.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For the Profil "Titreşim" switch: `[on, setOn]`. */
export function useHapticsPreference(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    subscribe,
    () => enabled,
    () => enabled,
  );
  return [on, (next: boolean) => void setHapticsEnabled(next)];
}

/** Plays the §7.3 pattern for `intent`. Fire and forget. */
export function haptic(intent: HapticIntent): void {
  if (!hapticsEnabled()) return;
  try {
    play(intent).catch(() => {});
  } catch {
    // A synchronous throw from a missing native module: ignore.
  }
}
