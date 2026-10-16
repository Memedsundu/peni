/**
 * Polls the Kafe modu board every 4s while the app is in the foreground (§9.10 "Polling"),
 * from the staff tab layout, so new orders ring and badge from any tab:
 * - a new order plays the `warning` haptic and, with "Ses" on, the chime (§10.10), and is
 *   announced to screen readers;
 * - the Tezgâh badge follows the number of new orders (`lib/staff-badge`);
 * - going to the background stops polling and sends any bump still waiting for its undo toast
 *   (the phone's `pagehide`); coming back reloads at once.
 * It also loads the café's own page once (its colourway and the till's menu, `cafe-detail`).
 * Renders nothing.
 */
import { formatNumber } from "@peni/brand/format";
import { useEffect } from "react";
import { AccessibilityInfo, AppState, type AppStateStatus } from "react-native";
import { haptic } from "@/lib/haptics";
import { useSession } from "@/lib/session";
import { staffSoundEnabled } from "@/lib/staff-prefs";
import { flushBumps, loadBoard, onNewOrders, selectCafe } from "./board-store";
import { loadCafeDetail } from "./cafe-detail";
import { useNewOrderChime } from "./chime";

/** §9.10: every 4s. */
export const POLL_MS = 4_000;

export function StaffBoardPoller() {
  const { api, staffKey, staffSlug } = useSession();
  const slug = staffKey && staffSlug ? staffSlug : null;
  const chime = useNewOrderChime();

  useEffect(() => {
    selectCafe(slug);
  }, [slug]);

  useEffect(() => {
    if (slug) void loadCafeDetail(api, slug);
  }, [api, slug]);

  // Leaving Kafe modu: whatever is waiting goes out, and the board is cleared.
  useEffect(
    () => () => {
      flushBumps();
      selectCafe(null);
    },
    [],
  );

  useEffect(
    () =>
      onNewOrders((count) => {
        haptic("warning");
        if (staffSoundEnabled()) chime();
        // Screen-reader users hear it too, wherever focus is ("2 yeni sipariş").
        AccessibilityInfo.announceForAccessibility(`${formatNumber(count)} yeni sipariş`);
      }),
    [chime],
  );

  useEffect(() => {
    if (!slug) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One loop at a time: every (re)start bumps `run`, and an older loop stops at its next step.
    let run = 0;
    const active = () => AppState.currentState === "active" || AppState.currentState == null;
    const tick = async (id: number) => {
      if (id !== run || !active()) return;
      await loadBoard(api, slug);
      if (id === run && active()) timer = setTimeout(() => void tick(id), POLL_MS);
    };
    const stop = () => {
      run += 1;
      if (timer) clearTimeout(timer);
    };
    const start = () => {
      stop();
      void tick(run);
    };
    const onChange = (state: AppStateStatus) => {
      if (state === "active") start();
      else {
        stop();
        if (state === "background") flushBumps();
      }
    };
    start();
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      stop();
      sub.remove();
    };
  }, [api, slug]);

  return null;
}
