/**
 * The staff café's public page (`cafes.get`), which the board doesn't carry:
 * - its colourway [G9], for the 2pt band under the press header and the 4pt band on tickets
 *   (§6.6, D6) — the same `hue ?? cafeHue(slug)` the web panel uses;
 * - its menu, for the till steppers on the Askı tab.
 *
 * Loaded once per café by `StaffBoardPoller` and kept for the session, so the Askı tab opens
 * with its steppers in place. The colourway is also remembered on the device (`staff-prefs`), so
 * the band is right from the first frame of the next launch.
 */
import type { CafeDetailDTO, PeniClient } from "@peni/api";
import type { CafeHue } from "@peni/brand/tokens";
import { useSyncExternalStore } from "react";
import { rememberCafe, useRememberedCafe } from "@/lib/staff-prefs";
import { messageOf } from "./board-store";

export interface CafeDetailEntry {
  detail: CafeDetailDTO | null;
  /** The last load failed; `detail` still holds the last good page. */
  error: string | null;
  loading: boolean;
}

const IDLE: CafeDetailEntry = { detail: null, error: null, loading: false };

let entries: ReadonlyMap<string, CafeDetailEntry> = new Map();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

function put(slug: string, next: Partial<CafeDetailEntry>) {
  const copy = new Map(entries);
  copy.set(slug, { ...(entries.get(slug) ?? IDLE), ...next });
  entries = copy;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Loads the café page once (again with `force`, for pull to refresh and "Tekrar dene"). Never throws. */
export function loadCafeDetail(api: PeniClient, slug: string, opts: { force?: boolean } = {}): Promise<void> {
  const current = entries.get(slug);
  if (!opts.force && current?.detail) return Promise.resolve();
  const running = inflight.get(slug);
  if (running) return running;
  put(slug, { loading: true, error: null });
  const run = api.cafes
    .get(slug)
    .then((detail) => {
      rememberCafe(slug, { name: detail.name, hue: detail.hue ?? null });
      put(slug, { detail, loading: false, error: null });
    })
    .catch((e: unknown) => put(slug, { loading: false, error: messageOf(e) }))
    .finally(() => inflight.delete(slug));
  inflight.set(slug, run);
  return run;
}

export function useCafeDetail(slug: string | null | undefined): CafeDetailEntry {
  const all = useSyncExternalStore(
    subscribe,
    () => entries,
    () => entries,
  );
  return (slug ? all.get(slug) : undefined) ?? IDLE;
}

/**
 * The café's own colourway: from its page once loaded, else as remembered on this device;
 * `null` lets the band fall back to `cafeHue(slug)`.
 */
export function useCafeHue(slug: string | null | undefined): CafeHue | null {
  const { detail } = useCafeDetail(slug);
  const remembered = useRememberedCafe(slug);
  if (detail) return detail.hue ?? null;
  return remembered.hue ?? null;
}
