/**
 * ToastHost / toast() (design-system.md §12.5, D21, A18): a small custom host on Reanimated —
 * no sonner-native, no gesture-handler.
 *
 * - At the top, below the safe area; one visible at a time (a new toast replaces the old one).
 * - 4s, or 5s with an action ("Geri al"). With a screen reader running, twice as long.
 * - `FadeInUp.duration(200)` in, `FadeOutUp.duration(150)` out, with `ReduceMotion.System`.
 *   Under Reduce Motion the toast only fades (A18): nothing slides.
 * - Every toast is announced (`announceForAccessibility`). On iOS the host sits in a
 *   `FullWindowOverlay`, so a toast shows above form sheets and modals too.
 * - Tones: `neutral`; `success` (`Check`, `successInk`); `danger` (`CircleAlert`, `danger`).
 *
 * Toasts are only for async outcomes the screen doesn't already show ("1 çay askıya asıldı.",
 * "Değiştirilemedi. Tekrar dene."). NEVER after sending an order (D15): the app goes to the fiş.
 * Mount `<ToastHost />` once, at the root.
 */
import { actionCopy, staffCopy } from "@peni/brand/copy";
import { Check, CircleAlert } from "lucide-react-native";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp, ReduceMotion, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { durations } from "@/lib/motion";
import { elevation, radius, useTokens } from "@/lib/theme";
import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { T } from "./t";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  tone?: ToastTone;
  /** Overrides the default 4000ms (5000ms with an action). */
  duration?: number;
  /** Runs once when the toast leaves for any reason other than its action. */
  onClose?: () => void;
}

export const TOAST_DURATION = 4000;
export const UNDO_DURATION = 5000;

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  onClose?: () => void;
}

/* ------------------------------------------------------------------------------------------ */
/* Store: one toast at a time, module-level so toast() works from anywhere                     */
/* ------------------------------------------------------------------------------------------ */

let current: ToastItem | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let readerOn = false;
if (Platform.OS !== "web") {
  AccessibilityInfo.isScreenReaderEnabled()
    .then((on) => (readerOn = on))
    .catch(() => {});
  AccessibilityInfo.addEventListener("screenReaderChanged", (on: boolean) => (readerOn = on));
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Removes the toast on screen (or only toast `id`). Its `onClose` runs. */
export function dismissToast(id?: number): void {
  if (!current || (id != null && current.id !== id)) return;
  const closing = current;
  clearTimer();
  current = null;
  emit();
  closing.onClose?.();
}

/** Shows `message` at the top, replacing any toast on screen. Returns its id. */
export function toast(message: string, opts: ToastOptions = {}): number {
  if (current) dismissToast(current.id);
  const item: ToastItem = {
    id: ++seq,
    message,
    tone: opts.tone ?? "neutral",
    action: opts.action,
    onClose: opts.onClose,
  };
  current = item;
  emit();
  AccessibilityInfo.announceForAccessibility(opts.action ? `${message} ${opts.action.label}` : message);
  const base = opts.duration ?? (opts.action ? UNDO_DURATION : TOAST_DURATION);
  timer = setTimeout(() => dismissToast(item.id), readerOn ? base * 2 : base);
  return item.id;
}

export interface UndoToastOptions {
  /** Runs if "Geri al" is pressed in time. Nothing is committed. */
  onUndo: () => void;
  /** Runs once when the toast leaves without an undo (timeout, tap, or a newer toast). Send the request here. */
  onCommit: () => void;
  actionLabel?: string;
}

/**
 * A deferred-commit toast (§9.10, "P-004 · Hazır" + "Geri al", 5s): exactly one of `onUndo` or
 * `onCommit` runs. Returns the toast id; `dismissToast(id)` commits early (app going to the
 * background, for instance).
 */
export function toastUndo(message: string, { onUndo, onCommit, actionLabel = staffCopy.undo }: UndoToastOptions): number {
  let settled = false;
  return toast(message, {
    duration: UNDO_DURATION,
    action: {
      label: actionLabel,
      onPress: () => {
        if (settled) return;
        settled = true;
        onUndo();
      },
    },
    onClose: () => {
      if (settled) return;
      settled = true;
      onCommit();
    },
  });
}

/** Runs a toast's action: the action decides, so `onClose` must not commit afterwards. */
function runAction(item: ToastItem) {
  if (current?.id !== item.id) return;
  clearTimer();
  current = null;
  emit();
  item.action?.onPress();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Host                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export function ToastHost() {
  const item = useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );

  // The layer stays mounted a moment after the toast goes, so its exit can play.
  const [mounted, setMounted] = useState(item != null);
  useEffect(() => {
    if (item) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), durations.toastOut + 50);
    return () => clearTimeout(id);
  }, [item]);

  if (!mounted && !item) return null;
  const layer = <ToastLayer item={item} />;
  // iOS: above native modals and form sheets too. Touches outside the toast pass through.
  return Platform.OS === "ios" ? <FullWindowOverlay>{layer}</FullWindowOverlay> : layer;
}

const motion = {
  entering: FadeInUp.duration(durations.toastIn).reduceMotion(ReduceMotion.System),
  exiting: FadeOutUp.duration(durations.toastOut).reduceMotion(ReduceMotion.System),
};
/** Reduce Motion: opacity only. A fade moves nothing, so it may play. */
const calm = {
  entering: FadeIn.duration(durations.toastIn).reduceMotion(ReduceMotion.Never),
  exiting: FadeOut.duration(durations.toastOut).reduceMotion(ReduceMotion.Never),
};

function ToastLayer({ item }: { item: ToastItem | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, alignItems: "center", zIndex: 60 }}
    >
      {item ? <ToastCard key={item.id} item={item} /> : null}
    </View>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const t = useTokens();
  const reduced = useReducedMotion();
  const { entering, exiting } = reduced ? calm : motion;
  const icon = item.tone === "danger" ? CircleAlert : item.tone === "success" ? Check : null;
  const iconColor = item.tone === "danger" ? t.danger : t.successInk;

  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      style={[
        {
          width: "100%",
          maxWidth: 420,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingLeft: 16,
          paddingRight: item.action ? 8 : 16,
          minHeight: 56,
          borderRadius: radius.card,
          backgroundColor: t.surface,
        },
        elevation("floating", t),
      ]}
    >
      {icon ? <Icon icon={icon} size={20} color={iconColor} /> : null}
      <PressableScale
        targetScale={1}
        onPress={() => dismissToast(item.id)}
        accessibilityRole="text"
        accessibilityHint={actionCopy.close}
        style={{ flex: 1, minHeight: 32, justifyContent: "center" }}
      >
        <T variant="body">{item.message}</T>
      </PressableScale>
      {item.action ? (
        <PressableScale
          targetScale={1}
          pressedColor={t.surface2}
          onPress={() => runAction(item)}
          accessibilityLabel={item.action.label}
          style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: radius.control, justifyContent: "center" }}
        >
          <T variant="button" style={{ textDecorationLine: "underline" }}>
            {item.action.label}
          </T>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}
