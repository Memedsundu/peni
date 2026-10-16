/**
 * One café's detail, shared by the café screen and its sheets (`sepet`, `katil`, `askidan-al`,
 * `askiya-birak`). The sheets are separate routes, so they read the same `CafeDetailDTO` from
 * here instead of fetching their own, and a join or a donation made in a sheet updates the
 * screen underneath at once.
 *
 * Module-level (like `lib/active-order.ts`): the screen and the sheets are siblings in the root
 * stack, with no common parent to hold it.
 *
 * - `useCafeEntry(slug)`: the café, its load state and the last error.
 * - `loadCafe(api, slug)`: first load (`loading` → `ok` / `not_found` / `error`) and quiet
 *   refreshes. Once a café is on screen, a failed refresh keeps it (errors after load NEVER
 *   replace the page, §9.3).
 * - `putCafe(slug, cafe)`: a response that already carries the café (`cafes.join`).
 * - Donations: the give sheet hands its result to the screen (`pushDonation`), which plays A8 on
 *   its own rail once the sheet has gone (`takeDonation`). D7: only the donor's own screen.
 * - Pending join: "Giriş yap ve katıl" goes to the sign-in modal; back on the café, signed in,
 *   the screen finishes the join (`setPendingJoin` / `takePendingJoin`).
 */
import { PeniApiError, type CafeDetailDTO, type MenuItemDTO, type PeniClient } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useSyncExternalStore } from "react";

export type CafeLoadStatus = "idle" | "loading" | "ok" | "not_found" | "error";

export interface CafeEntry {
  cafe: CafeDetailDTO | null;
  status: CafeLoadStatus;
  /** The first load's error (shown with "Tekrar dene"); null once a café is on screen. */
  error: string | null;
  /** When the café was last read (ms). */
  fetchedAt: number;
}

const EMPTY: CafeEntry = { cafe: null, status: "idle", error: null, fetchedAt: 0 };

const entries = new Map<string, CafeEntry>();
/** The read in flight per café, with the client that sent it (a new sign-in sends a new one). */
const inFlight = new Map<string, { api: PeniClient; seq: number; promise: Promise<CafeDetailDTO | null> }>();
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(slug: string, patch: Partial<CafeEntry>) {
  entries.set(slug, { ...(entries.get(slug) ?? EMPTY), ...patch });
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getCafeEntry(slug: string): CafeEntry {
  return entries.get(slug) ?? EMPTY;
}

/** The café as the screen and its sheets see it. */
export function useCafeEntry(slug: string): CafeEntry {
  return useSyncExternalStore(
    subscribe,
    () => getCafeEntry(slug),
    () => getCafeEntry(slug),
  );
}

/** "Bağlantı kurulamadı. Tekrar dene." for a dropped connection, else the API's own sentence. */
export function messageOf(e: unknown): string {
  if (e instanceof PeniApiError && e.code === "NETWORK") return errorCopy.network;
  return e instanceof Error && e.message ? e.message : errorCopy.generic;
}

/**
 * Reads the café. Concurrent calls for one slug share a request. A failure before anything is
 * on screen becomes `not_found` / `error`; after that it is swallowed and the café stays.
 */
export function loadCafe(api: PeniClient, slug: string): Promise<CafeDetailDTO | null> {
  const running = inFlight.get(slug);
  if (running && running.api === api) return running.promise;
  const mine = ++seq;
  const latest = () => inFlight.get(slug)?.seq === mine;
  if (!getCafeEntry(slug).cafe) set(slug, { status: "loading", error: null });
  const promise = (async () => {
    try {
      const cafe = await api.cafes.get(slug);
      if (latest()) set(slug, { cafe, status: "ok", error: null, fetchedAt: Date.now() });
      return cafe;
    } catch (e) {
      if (!latest() || getCafeEntry(slug).cafe) return null;
      if (e instanceof PeniApiError && e.status === 404) set(slug, { status: "not_found", error: null });
      else set(slug, { status: "error", error: messageOf(e) });
      return null;
    } finally {
      if (latest()) inFlight.delete(slug);
    }
  })();
  inFlight.set(slug, { api, seq: mine, promise });
  return promise;
}

/** A response that already holds the whole café (`cafes.join`). A read in flight no longer counts. */
export function putCafe(slug: string, cafe: CafeDetailDTO): void {
  inFlight.delete(slug);
  set(slug, { cafe, status: "ok", error: null, fetchedAt: Date.now() });
}

/* ------------------------------------------------------------------------------------------ */
/* One's own donation, from the give sheet to the screen (A8)                                 */
/* ------------------------------------------------------------------------------------------ */

export interface Donation {
  /** Peni the viewer left. */
  peni: number;
  /** Peni the café added on top (the donate response's `matchedPeni`). */
  matchedPeni: number;
  /** The chip they chose, or null for "Başka". */
  item: MenuItemDTO | null;
}

const donations = new Map<string, Donation>();

export function pushDonation(slug: string, d: Donation): void {
  donations.set(slug, d);
  emit();
}

/** The donation waiting to be shown on this café's rail, once. */
export function takeDonation(slug: string): Donation | null {
  const d = donations.get(slug) ?? null;
  donations.delete(slug);
  return d;
}

export function hasDonation(slug: string): boolean {
  return donations.has(slug);
}

/* ------------------------------------------------------------------------------------------ */
/* "Giriş yap ve katıl": finish the join after the sign-in modal                              */
/* ------------------------------------------------------------------------------------------ */

/** A sign-in started for a join counts for this long; later, back on the café, nothing happens. */
const PENDING_JOIN_MS = 10 * 60 * 1000;
const pendingJoins = new Map<string, number>();

export function setPendingJoin(slug: string): void {
  pendingJoins.set(slug, Date.now());
}

export function takePendingJoin(slug: string): boolean {
  const at = pendingJoins.get(slug);
  pendingJoins.delete(slug);
  return at != null && Date.now() - at < PENDING_JOIN_MS;
}
