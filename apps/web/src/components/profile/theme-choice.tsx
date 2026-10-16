"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, readTheme, THEME_STORAGE_KEY, type ThemePreference } from "@/components/chrome/theme";
import { Segmented } from "@/components/ui";

const ITEMS = [
  { id: "system", label: "Sistem" },
  { id: "light", label: "Açık" },
  { id: "dark", label: "Koyu" },
] as const;

/* The preference lives in localStorage["peni-theme"] (chrome/theme.ts). Other tabs report
   changes through `storage`; this tab through `notify()`. */
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) {
      // Another tab changed it: follow it here too.
      applyTheme(readTheme());
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * "Görünüm" (design-system.md §9.8): Sistem · Açık · Koyu. Writes `localStorage["peni-theme"]`
 * and `<html data-theme>` at once, through `applyTheme`; "Sistem" removes both. The server
 * renders "Sistem" and the real choice appears on hydration.
 */
export function ThemeChoice({ className }: { className?: string }) {
  const value = useSyncExternalStore<ThemePreference>(subscribe, readTheme, () => "system");
  return (
    <Segmented
      id="gorunum"
      variant="track"
      label="Görünüm"
      items={ITEMS}
      value={value}
      onChange={(id) => {
        applyTheme(id as ThemePreference);
        notify();
      }}
      className={className}
    />
  );
}
