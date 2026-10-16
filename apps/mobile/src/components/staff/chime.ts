/**
 * The new-order chime (design-system.md §10.10): `expo-audio` with the bundled
 * `assets/sounds/new-order.wav`; each new order rewinds and plays it. The browser preview uses
 * `chime.web.ts` instead (no native player there).
 *
 * The chime plays even with the ringer switch on silent (a café counter is loud, and the "Ses"
 * switch in Ayarlar is the staff's own off switch), and mixes with whatever else is playing.
 */
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useCallback, useEffect } from "react";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SOUND = require("../../../assets/sounds/new-order.wav");

export function useNewOrderChime(): () => void {
  const player = useAudioPlayer(SOUND);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
  }, []);

  return useCallback(() => {
    try {
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // No audio device (or the player is gone): the haptic and the badge still tell.
    }
  }, [player]);
}
