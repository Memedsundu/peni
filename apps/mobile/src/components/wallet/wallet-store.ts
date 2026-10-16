/**
 * The wallet, shared by the Cüzdan tab, the `ismarla` sheet and `peni-kodum` (§10.5, §10.6).
 * Those are separate routes in the root stack with no common parent, so they read one
 * module-level copy (like `cafe-store`): the sheet and the QR open with no wait when Cüzdan has
 * already read it, and a gift sent in the sheet shows on the tab underneath at once.
 *
 * - `useWalletEntry()`: the wallet, its load state and the first load's error.
 * - `loadWallet(api)`: first load (`loading` → `ok` / `signed_out` / `error`) and quiet
 *   refreshes. Once a wallet is on screen, a failed refresh keeps it (an error after load never
 *   wipes the page) and is returned for a toast.
 * - Cities (for the coin's "M" over "K · İ") come from the café list, read once.
 */
import { PeniApiError, type FullWalletDTO, type PeniClient } from "@peni/api";
import { errorCopy } from "@peni/brand/copy";
import { useSyncExternalStore } from "react";

export type WalletStatus = "idle" | "loading" | "ok" | "signed_out" | "error";

export interface WalletEntry {
  wallet: FullWalletDTO | null;
  status: WalletStatus;
  /** The first load's error (with "Tekrar dene"); null once a wallet is on screen. */
  error: string | null;
  /** City per café slug, for the coin's initials triad. */
  cities: Readonly<Record<string, string | null>>;
}

const EMPTY: WalletEntry = { wallet: null, status: "idle", error: null, cities: {} };

let entry: WalletEntry = EMPTY;
let inFlight: { api: PeniClient; promise: Promise<string | null> } | null = null;
let citiesFor: PeniClient | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<WalletEntry>) {
  entry = { ...entry, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useWalletEntry(): WalletEntry {
  return useSyncExternalStore(
    subscribe,
    () => entry,
    () => entry,
  );
}

export function walletSnapshot(): WalletEntry {
  return entry;
}

/** The message to show for an error. */
export function messageOf(e: unknown): string {
  return e instanceof PeniApiError || e instanceof Error ? e.message || errorCopy.generic : errorCopy.generic;
}

/**
 * Reads the wallet. Resolves with null on success, or with the error message of a failed
 * refresh (the wallet already on screen stays). A new client (sign-in, sign-out) re-reads;
 * pass `force` after a change (a gift accepted, sent, taken back).
 */
export function loadWallet(api: PeniClient, opts: { force?: boolean } = {}): Promise<string | null> {
  // A read already on its way is good enough, unless something just changed: then a new read
  // supersedes it (the older answer is dropped when it lands).
  if (inFlight && inFlight.api === api && !opts.force) return inFlight.promise;
  if (!entry.wallet) set({ status: "loading", error: null });
  const self: { api: PeniClient; promise: Promise<string | null> } = { api, promise: Promise.resolve(null) };
  self.promise = (async () => {
    try {
      const wallet = await api.wallet.get();
      if (inFlight !== self) return null; // signed out or superseded meanwhile
      set({ wallet, status: "ok", error: null });
      void loadCities(api);
      return null;
    } catch (e) {
      if (inFlight !== self) return null;
      if (e instanceof PeniApiError && e.status === 401) {
        set({ wallet: null, status: "signed_out", error: null });
        return null;
      }
      const message = messageOf(e);
      if (entry.wallet) return message;
      set({ status: "error", error: message });
      return message;
    } finally {
      if (inFlight === self) inFlight = null;
    }
  })();
  inFlight = self;
  return self.promise;
}

async function loadCities(api: PeniClient) {
  if (citiesFor === api) return;
  citiesFor = api;
  try {
    const { cafes } = await api.cafes.list();
    set({ cities: Object.fromEntries(cafes.map((c) => [c.slug, c.city])) });
  } catch {
    citiesFor = null; // The coin shows only its top initial until the next read.
  }
}

/** Signed out: forget the wallet (the next sign-in starts clean). */
export function resetWallet(status: WalletStatus = "signed_out"): void {
  inFlight = null;
  citiesFor = null;
  set({ ...EMPTY, status });
}
