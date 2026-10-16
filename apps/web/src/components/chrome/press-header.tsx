"use client";

import { PeniApiError } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { formatTime } from "@peni/brand/format";
import { dark, type CafeHue } from "@peni/brand/tokens";
import { CirclePause, LogOut, Volume2, VolumeX } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { clearStaffKey, peni, readStaffKey, STAFF_KEY } from "@/lib/client";

/**
 * Staff "press room" shell (design-system.md §8.3): the 56px PressHeader in fixed `press` colours
 * (dark in both themes, D3) with a 2px café-hue band, then the content at max-width 1280px.
 * No customer header, bottom nav or footer.
 *
 * The staff page talks to the header through `usePress()`:
 * - `report({ paused, pausedUntil })` after every dashboard poll keeps the pause pill live;
 * - `setPauseHandler(fn)` makes the pill open the PauseSheet (otherwise it toggles directly);
 * - `soundOn` / `setSoundOn` is the "Ses açık / Ses kapalı" preference (persisted);
 * - `refreshKey()` after the gate stores a key; `signOut()` forgets it ("Çıkış").
 * Until the page reports, the shell reads the pause state once itself, so the pill is never blank.
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
  /** Whether a staff key is stored. */
  keyed: boolean;
  /** Pause state, or null while unknown (the pill is hidden). */
  pause: PauseState | null;
  report: (state: PauseState) => void;
  setPauseHandler: (handler: (() => void) | null) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  refreshKey: () => void;
  signOut: () => void;
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
  const [keyed, setKeyed] = useState(false);
  const [pause, setPause] = useState<PauseState | null>(null);
  const [soundOn, setSoundState] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const pageReports = useRef(false);
  const pauseHandler = useRef<(() => void) | null>(null);

  const refreshKey = useCallback(() => setKeyed(Boolean(readStaffKey())), []);

  useEffect(() => {
    refreshKey();
    setSoundState(readSound());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STAFF_KEY || e.key === null) refreshKey();
      if (e.key === SOUND_STORAGE) setSoundState(readSound());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshKey);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshKey);
    };
  }, [refreshKey]);

  // Read the pause state ourselves until the page starts reporting it.
  const loadPause = useCallback(async () => {
    if (pageReports.current || !readStaffKey()) return;
    try {
      const d = await peni.staff.dashboard(slug);
      if (!pageReports.current) setPause({ paused: d.cafe.appOrderingPaused, pausedUntil: d.cafe.pausedUntil });
    } catch (error) {
      if (error instanceof PeniApiError && error.status === 403) setKeyed(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!keyed) {
      setPause(null);
      return;
    }
    void loadPause();
    const onVisible = () => document.visibilityState === "visible" && void loadPause();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [keyed, loadPause]);

  const report = useCallback((state: PauseState) => {
    pageReports.current = true;
    setKeyed(true);
    setPause((prev) =>
      prev && prev.paused === state.paused && (prev.pausedUntil ?? null) === (state.pausedUntil ?? null) ? prev : state,
    );
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

  const signOut = useCallback(() => {
    clearStaffKey();
    pageReports.current = false;
    pauseHandler.current = null;
    setKeyed(false);
    setPause(null);
    setEpoch((e) => e + 1); // remount the page so it shows its gate again
  }, []);

  const [toggling, setToggling] = useState(false);
  const onPausePress = useCallback(async () => {
    if (pauseHandler.current) return pauseHandler.current();
    if (!pause || toggling) return;
    setToggling(true);
    try {
      const r = await peni.staff.setPaused(slug, pause.paused ? null : true);
      setPause({ paused: r.appOrderingPaused, pausedUntil: r.pausedUntil });
    } catch {
      toast.error(errorCopy.change);
    } finally {
      setToggling(false);
    }
  }, [pause, slug, toggling]);

  const value = useMemo<PressContextValue>(
    () => ({ slug, cafeName, hue, keyed, pause, report, setPauseHandler, soundOn, setSoundOn, refreshKey, signOut }),
    [slug, cafeName, hue, keyed, pause, report, setPauseHandler, soundOn, setSoundOn, refreshKey, signOut],
  );

  return (
    <PressContext.Provider value={value}>
      {/* `--header-h` here is the press header + band, so sticky staff controls sit under it. */}
      <div className="min-h-dvh [--header-h:58px]">
        <PressHeader onPausePress={onPausePress} pauseBusy={toggling} />
        <div
          key={epoch}
          // The gate is a form: once it is submitted, see whether a key was stored.
          onSubmitCapture={() => window.setTimeout(refreshKey, 0)}
          className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-16 sm:px-6 lg:px-8"
        >
          {children}
        </div>
      </div>
    </PressContext.Provider>
  );
}

/** Status colours on the press surface use their dark-theme values: press is dark in both themes. */
const pressStatusVars = {
  "--focus": "var(--on-press)",
  "--success": dark.success,
  "--warning-ink": dark.warningInk,
} as React.CSSProperties;

const pressButton =
  "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 text-on-press transition-[scale,background-color] duration-150 ease-out-strong hover:bg-on-press/10 active:scale-[.97] active:bg-on-press/10 motion-reduce:transition-none motion-reduce:active:scale-100";

function PressHeader({ onPausePress, pauseBusy }: { onPausePress: () => void; pauseBusy: boolean }) {
  const { cafeName, hue, keyed, pause, soundOn, setSoundOn, signOut } = usePress();
  const pillText = pause?.paused ? staffCopy.ordersPaused : staffCopy.ordersOpen;
  const [pillLabel, pillValue] = splitLabel(pillText);

  return (
    <header className="sticky top-0 z-30 bg-press text-on-press" style={pressStatusVars}>
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <p className="min-w-0 truncate font-sans text-item">{cafeName}</p>
          <PressClock />
        </div>

        {keyed && pause && (
          <button
            type="button"
            onClick={onPausePress}
            aria-busy={pauseBusy || undefined}
            className="group inline-flex h-11 shrink-0 cursor-pointer items-center rounded-[10px]"
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-[10px] border-[1.5px] border-on-press-2/50 px-3 text-meta font-semibold whitespace-nowrap transition-colors duration-150 group-hover:bg-on-press/10 motion-reduce:transition-none">
              {pause.paused ? (
                <CirclePause size={16} absoluteStrokeWidth strokeWidth={1.75} aria-hidden className="text-warning-ink" />
              ) : (
                <span aria-hidden className="size-2 rounded-full bg-success" />
              )}
              <span>
                <span className="sr-only sm:not-sr-only">{pillLabel} </span>
                <span className={pause.paused ? "text-warning-ink" : undefined}>{pillValue}</span>
              </span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setSoundOn(!soundOn)}
          aria-label={soundOn ? staffCopy.soundOn : staffCopy.soundOff}
          title={soundOn ? staffCopy.soundOn : staffCopy.soundOff}
          className={`${pressButton} size-11 rounded-full`}
        >
          {soundOn ? (
            <Volume2 size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <VolumeX size={20} strokeWidth={1.75} aria-hidden className="text-on-press-2" />
          )}
        </button>

        {keyed && (
          <button
            type="button"
            onClick={signOut}
            className={`${pressButton} min-w-11 rounded-[10px] px-2.5 text-button sm:px-3`}
          >
            <LogOut size={20} strokeWidth={1.75} aria-hidden />
            <span className="sr-only sm:not-sr-only">{staffCopy.logout}</span>
          </button>
        )}
      </div>
      <div aria-hidden className="h-0.5 shadow-[0_0_0_1px_var(--plate-ring)]" style={{ background: `var(--hue-${hue})` }} />
    </header>
  );
}

/** "Uygulama siparişleri: Açık" → ["Uygulama siparişleri:", "Açık"]; the label hides on phones. */
function splitLabel(text: string): [string, string] {
  const i = text.lastIndexOf(": ");
  return i < 0 ? ["", text] : [text.slice(0, i + 1), text.slice(i + 2)];
}

/** Live HH:MM (Istanbul time), tabular, ticking on the minute. */
function PressClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: number | undefined;
    const tick = () => setNow(new Date());
    tick();
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);
  return (
    <time
      dateTime={now.toISOString()}
      suppressHydrationWarning
      className="shrink-0 text-body text-on-press-2 tabular-nums"
    >
      {formatTime(now)}
    </time>
  );
}
