"use client";

import { staffCopy } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { dark, type CafeHue } from "@peni/brand/tokens";
import { CirclePause, LogOut, Volume2, VolumeX } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DeviceGlyph } from "@/components/brand";
import { cx, focusRing, pressMotion, tappable } from "@/components/ui";
import { unlockAudio, useAudioReady } from "@/components/staff/sound";
import { clearStaffKey, readStaffKey, STAFF_KEY, writeStaffKey } from "@/lib/client";

/**
 * Staff "press room" shell (design-system.md §8.3): the 56px PressHeader in the fixed `press`
 * colours (dark in both themes, D3) with a 2px café-hue band, then the content at max-width
 * 1280px. No customer header, bottom nav or footer.
 *
 * The café panel talks to the header through `usePress()`:
 * - `keyed` / `signIn(key)` / `signOut()`: the staff key ("Çıkış" forgets it);
 * - `pause` + `report()`: the page reports the pause state after every poll; the pill shows it
 *   and calls the handler set with `setPauseHandler()` (the PauseSheet);
 * - `soundOn` (the "Ses açık / Ses kapalı" preference, kept in localStorage) and `audible`
 *   (the preference AND a running AudioContext, which needs a tap after every page load).
 */

const SOUND_STORAGE = "peni.staffSound";

export interface PauseState {
  paused: boolean;
  /** Auto-resume time [G20], or null. */
  pausedUntil?: string | null;
}

interface PressContextValue {
  slug: string;
  cafeName: string;
  hue: CafeHue;
  /** Whether a staff key is stored; null before the first client render. */
  keyed: boolean | null;
  signIn: (key: string) => void;
  signOut: () => void;
  /** Pause state, or null while unknown (the pill is hidden). */
  pause: PauseState | null;
  report: (state: PauseState | null) => void;
  setPauseHandler: (handler: (() => void) | null) => void;
  /** The preference. */
  soundOn: boolean;
  /** The preference, and the browser lets the page play sound right now. */
  audible: boolean;
  /** Call inside a click: unlocks audio and turns the preference on. */
  turnSoundOn: () => void;
  setSoundOn: (on: boolean) => void;
}

const PressContext = createContext<PressContextValue | null>(null);

export function usePress(): PressContextValue {
  const ctx = useContext(PressContext);
  if (!ctx) throw new Error("usePress() must be used inside <PressShell>");
  return ctx;
}

function readSound(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE) !== "off";
  } catch {
    return true;
  }
}

export function PressShell({
  slug,
  cafeName,
  hue,
  children,
}: {
  slug: string;
  cafeName: string;
  hue: CafeHue;
  children: React.ReactNode;
}) {
  const [keyed, setKeyed] = useState<boolean | null>(null);
  const [pause, setPause] = useState<PauseState | null>(null);
  const [soundOn, setSoundState] = useState(true);
  const audioReady = useAudioReady();
  const pauseHandler = useRef<(() => void) | null>(null);

  useEffect(() => {
    setKeyed(Boolean(readStaffKey()));
    setSoundState(readSound());
    // Another tab signed out, or changed the sound preference.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STAFF_KEY || e.key === null) setKeyed(Boolean(readStaffKey()));
      if (e.key === SOUND_STORAGE) setSoundState(readSound());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((key: string) => {
    writeStaffKey(key);
    setKeyed(true);
  }, []);

  const signOut = useCallback(() => {
    clearStaffKey();
    pauseHandler.current = null;
    setPause(null);
    setKeyed(false);
  }, []);

  const report = useCallback((state: PauseState | null) => {
    setPause((prev) => {
      if (!state || !prev) return state;
      return prev.paused === state.paused && (prev.pausedUntil ?? null) === (state.pausedUntil ?? null) ? prev : state;
    });
  }, []);

  const setPauseHandler = useCallback((handler: (() => void) | null) => {
    pauseHandler.current = handler;
  }, []);

  const setSoundOn = useCallback((on: boolean) => {
    setSoundState(on);
    try {
      localStorage.setItem(SOUND_STORAGE, on ? "on" : "off");
    } catch {
      // Private mode: the choice lasts for this tab.
    }
  }, []);

  const turnSoundOn = useCallback(() => {
    void unlockAudio();
    setSoundOn(true);
  }, [setSoundOn]);

  const value = useMemo<PressContextValue>(
    () => ({
      slug,
      cafeName,
      hue,
      keyed,
      signIn,
      signOut,
      pause,
      report,
      setPauseHandler,
      soundOn,
      audible: soundOn && audioReady,
      turnSoundOn,
      setSoundOn,
    }),
    [slug, cafeName, hue, keyed, signIn, signOut, pause, report, setPauseHandler, soundOn, audioReady, turnSoundOn, setSoundOn],
  );

  return (
    <PressContext.Provider value={value}>
      {/* `--header-h` is the press header + its band, so sticky staff controls sit under it. */}
      <div className="min-h-dvh [--header-h:58px]">
        <PressHeader onPausePress={() => pauseHandler.current?.()} />
        {/* Anything scrolled into view (keyboard focus) clears the sticky header and bars. */}
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-16 sm:px-6 lg:px-8 [&_*]:scroll-mt-32">{children}</main>
      </div>
    </PressContext.Provider>
  );
}

/**
 * Status colours on the press surface use their dark-theme values: press is dark in both
 * themes. Focus rings turn `on-press` (D2).
 */
const pressVars = {
  "--focus": "var(--on-press)",
  "--success": dark.success,
  "--warning-ink": dark.warningInk,
  "--warning-soft": dark.warningSoft,
} as React.CSSProperties;

const pressButton = cx(
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 text-on-press hover:bg-on-press/10 active:bg-on-press/10",
  tappable,
  focusRing,
  pressMotion,
);

function PressHeader({ onPausePress }: { onPausePress: () => void }) {
  const { slug, cafeName, hue, keyed, pause, audible, turnSoundOn, setSoundOn, signOut } = usePress();
  const soundLabel = audible ? staffCopy.soundOn : staffCopy.soundOff;

  return (
    <header className="sticky top-0 z-30 bg-press text-on-press" style={pressVars}>
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        {/* Phone: the name over the clock. From 640px: one line, the clock beside the name. */}
        <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
          <p className="flex min-w-0 items-center gap-2 text-[17px] leading-[22px] font-semibold">
            <DeviceGlyph slug={slug} size={20} className="hidden text-on-press-2 sm:block" />
            <span className="truncate">{cafeName}</span>
          </p>
          <PressClock />
        </div>

        {keyed && pause && <PausePill paused={pause.paused} onPress={onPausePress} />}

        {keyed && (
          <div className="-mr-2 flex shrink-0 items-center sm:mr-0 sm:gap-1">
            <button
              type="button"
              onClick={() => (audible ? setSoundOn(false) : turnSoundOn())}
              aria-label={soundLabel}
              title={soundLabel}
              className={cx(pressButton, "size-11 rounded-full")}
            >
              {audible ? (
                <Volume2 size={20} strokeWidth={1.75} aria-hidden />
              ) : (
                <VolumeX size={20} strokeWidth={1.75} aria-hidden className="text-on-press-2" />
              )}
            </button>
            <button type="button" onClick={signOut} className={cx(pressButton, "min-w-11 rounded-[10px] px-2.5 text-button sm:px-3")}>
              <LogOut size={20} strokeWidth={1.75} aria-hidden />
              <span className="sr-only sm:not-sr-only">{staffCopy.logout}</span>
            </button>
          </div>
        )}
      </div>
      <div aria-hidden className="h-0.5 shadow-[0_0_0_1px_var(--plate-ring)]" style={{ background: `var(--hue-${hue})` }} />
    </header>
  );
}

/**
 * "Uygulama siparişleri: Açık" (success dot) / "Uygulama siparişleri: Durdu" (CirclePause, on a
 * warning plate). Phones show the value only; the label stays for screen readers.
 */
function PausePill({ paused, onPress }: { paused: boolean; onPress: () => void }) {
  const [label, value] = splitLabel(paused ? staffCopy.ordersPaused : staffCopy.ordersOpen);
  return (
    <button
      type="button"
      onClick={onPress}
      aria-haspopup="dialog"
      className={cx("group inline-flex h-11 shrink-0 items-center rounded-[10px]", tappable, focusRing, pressMotion)}
    >
      <span
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-meta font-semibold whitespace-nowrap transition-colors duration-150 motion-reduce:transition-none",
          paused
            ? "bg-warning-soft text-warning-ink"
            : "border-[1.5px] border-on-press-2/45 group-hover:bg-on-press/10 group-active:bg-on-press/10",
        )}
      >
        {paused ? (
          <CirclePause size={16} absoluteStrokeWidth strokeWidth={1.75} aria-hidden />
        ) : (
          <span aria-hidden className="size-2 rounded-full bg-success" />
        )}
        <span>
          <span className="sr-only md:not-sr-only">{label} </span>
          {value}
        </span>
      </span>
    </button>
  );
}

/** "Uygulama siparişleri: Açık" → ["Uygulama siparişleri:", "Açık"]. */
function splitLabel(text: string): [string, string] {
  const i = text.lastIndexOf(": ");
  return i < 0 ? ["", text] : [text.slice(0, i + 1), text.slice(i + 2)];
}

/** Live HH:MM (Istanbul time), tabular, ticking on the minute. */
function PressClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let interval: number | undefined;
    const tick = () => setNow(new Date());
    tick();
    const timeout = window.setTimeout(
      () => {
        tick();
        interval = window.setInterval(tick, 60_000);
      },
      60_000 - (Date.now() % 60_000) + 50,
    );
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);
  return (
    <time
      dateTime={now?.toISOString()}
      className="shrink-0 text-meta text-on-press-2 tabular-nums sm:text-body"
      // Rendered after mount only: the server's minute may not be the viewer's.
    >
      {now ? formatTime(now) : " "}
    </time>
  );
}
