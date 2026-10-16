/** Small hooks shared by the Kafe modu tabs. */
import { useKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/** Re-renders every `intervalMs` (15s by default), so elapsed chips and countdowns stay within a minute. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** True for `ms` after `since` changes (a ticket is moving, A12): taps never land on a moving ticket. */
export function useSettling(since: number, ms = 260): boolean {
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    const left = since + ms - Date.now();
    if (!since || left <= 0) {
      setSettling(false);
      return;
    }
    setSettling(true);
    const id = setTimeout(() => setSettling(false), left);
    return () => clearTimeout(id);
  }, [since, ms]);
  return settling;
}

function KeepAwake() {
  useKeepAwake("peni-tezgah");
  return null;
}

/**
 * Holds the screen awake while the Tezgâh tab is focused (§10.10 `useKeepAwake()`). The browser
 * preview has no wake lock to hold, so nothing is mounted there.
 */
export function KeepAwakeWhileFocused() {
  const focused = useIsFocused();
  return focused && Platform.OS !== "web" ? <KeepAwake /> : null;
}
