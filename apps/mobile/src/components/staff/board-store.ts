/**
 * The Kafe modu board (design-system.md §9.10, §10.10): one dashboard shared by the four staff
 * tabs and the `reddet` / `durdur` sheets, polled by `StaffBoardPoller` (mounted with the tabs),
 * so the Tezgâh badge, the chime and the haptic work from any tab.
 *
 * - Errors keep the last good board on screen; a 401/403 marks the key as rejected.
 * - Bumps are deferred commits (§9.10 "Bump with undo"): the ticket moves at once (an override
 *   on top of the polled board), a 5s toast "P-004 · Hazır" offers "Geri al", and the request
 *   goes out when the toast closes — or at once when another bump or toast replaces it, or the
 *   app goes to the background (`flushBumps`). Undo sends nothing. A failure toasts
 *   "Kaydedilemedi: {message}" and the ticket returns to its column.
 * - Requests for one order are chained, so "Hazır" never overtakes the "Kabul et" before it.
 * - Reject is sent at once: the sheet was the confirmation.
 * - A poll that started before a local change is dropped (its board is older than the screen).
 */
import { PeniApiError, type OrderDTO, type PauseDuration, type PeniClient, type StaffDashboardDTO } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { useSyncExternalStore } from "react";
import { dismissToast, toast, UNDO_DURATION } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";
import { setNewOrderCount } from "@/lib/staff-badge";
import { rememberCafe } from "@/lib/staff-prefs";
import { applyOverride, boardColumns, bumpToastText, statusAfter, type BumpAction, type Override } from "./model";

export interface BoardSnapshot {
  /** The café this board is for; null with no key or no café. */
  slug: string | null;
  data: StaffDashboardDTO | null;
  /** The last poll failed; `data` still holds the last good board. */
  error: string | null;
  /** Nothing has come back yet for this café. */
  loading: boolean;
  /** The server turned the key down (401/403). */
  unauthorized: boolean;
  /** Bumps on screen that the server may not know yet. */
  overrides: ReadonlyMap<string, Override>;
  /** Orders that arrived during this shift → when (ms), for the A13 bar. */
  arrivals: ReadonlyMap<string, number>;
  /** When the last ticket started to move (ms): taps wait until it has settled (A12). */
  movedAt: number;
}

const EMPTY: BoardSnapshot = {
  slug: null,
  data: null,
  error: null,
  loading: false,
  unauthorized: false,
  overrides: new Map(),
  arrivals: new Map(),
  movedAt: 0,
};

let snap: BoardSnapshot = EMPTY;
const listeners = new Set<() => void>();
/** Order ids already seen for this café: anything new and `submitted` after the first load rings. */
let known = new Set<string>();
let seeded = false;
/** Bumped on every local change: a poll that started before it is dropped. */
let generation = 0;
/** Only the newest request's answer is applied. */
let requestSeq = 0;
let bumpSeq = 0;
const newOrderListeners = new Set<(count: number) => void>();

function set(next: Partial<BoardSnapshot>) {
  snap = { ...snap, ...next };
  syncBadge();
  listeners.forEach((l) => l());
}

/** The Tezgâh tab badge: new orders as the screen shows them (after bumps). */
function syncBadge() {
  if (!snap.data) {
    setNewOrderCount(0);
    return;
  }
  setNewOrderCount(boardColumns(snap.data.orders, snap.overrides).submitted.length);
}

export function getBoard(): BoardSnapshot {
  return snap;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useBoard(): BoardSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snap,
    () => snap,
  );
}

/** Fires once per poll that brings new orders (the chime and the `warning` haptic). */
export function onNewOrders(listener: (count: number) => void): () => void {
  newOrderListeners.add(listener);
  return () => {
    newOrderListeners.delete(listener);
  };
}

export function messageOf(error: unknown): string {
  if (error instanceof PeniApiError && error.code === "NETWORK") return errorCopy.network;
  return error instanceof Error && error.message ? error.message : errorCopy.generic;
}

/** Points the board at a café (or none). Switching starts clean: nothing from the last café rings. */
export function selectCafe(slug: string | null): void {
  if (snap.slug === slug) return;
  flushBumps();
  known = new Set();
  seeded = false;
  generation += 1;
  snap = { ...EMPTY, slug, loading: slug != null };
  syncBadge();
  listeners.forEach((l) => l());
}

/** Call before a local change, so an older poll in flight can't bring the old board back. */
function touch() {
  generation += 1;
}

/** Loads the board. Resolves either way; the state says how it went. */
export async function loadBoard(api: PeniClient, slug: string): Promise<void> {
  if (snap.slug !== slug) return;
  const started = generation;
  const id = ++requestSeq;
  try {
    const data = await api.staff.dashboard(slug);
    if (snap.slug !== slug || generation !== started || id !== requestSeq) return;
    const arrivals = noteArrivals(data);
    rememberCafe(slug, { name: data.cafe.name });
    set({ data, error: null, loading: false, unauthorized: false, arrivals: arrivals.map });
    if (arrivals.count > 0) newOrderListeners.forEach((l) => l(arrivals.count));
  } catch (e) {
    if (snap.slug !== slug || id !== requestSeq) return;
    if (e instanceof PeniApiError && (e.status === 401 || e.status === 403)) {
      set({ unauthorized: true, loading: false, error: null });
      return;
    }
    set({ error: messageOf(e), loading: false });
  }
}

/** Marks orders seen; new `submitted` ones (after the first load) start their A13 bar now. */
function noteArrivals(data: StaffDashboardDTO): { map: ReadonlyMap<string, number>; count: number } {
  const now = Date.now();
  let map: Map<string, number> | null = null;
  let count = 0;
  for (const o of data.orders) {
    if (known.has(o.id)) continue;
    known.add(o.id);
    if (seeded && o.status === "submitted") {
      map ??= new Map(snap.arrivals);
      map.set(o.id, now);
      count += 1;
    }
  }
  seeded = true;
  // Bars older than a minute are long gone: forget them.
  if (map) for (const [id, at] of map) if (now - at > 60_000) map.delete(id);
  return { map: map ?? snap.arrivals, count };
}

/** The order as the board draws it (with a pending bump), for the sheets. */
export function findOrder(id: string | null | undefined): OrderDTO | null {
  if (!id || !snap.data) return null;
  const raw = snap.data.orders.find((o) => o.id === id);
  return raw ? applyOverride(raw, snap.overrides.get(id)) : null;
}

function patchData(fn: (d: StaffDashboardDTO) => StaffDashboardDTO) {
  if (snap.data) set({ data: fn(snap.data) });
}

function patchOrder(order: OrderDTO) {
  patchData((d) => ({ ...d, orders: d.orders.map((o) => (o.id === order.id ? order : o)) }));
}

/** Removes the override `token` put there — never a newer bump on the same ticket. */
function dropOverride(id: string, token?: number) {
  const current = snap.overrides.get(id);
  if (!current || (token !== undefined && current.token !== token)) return;
  const next = new Map(snap.overrides);
  next.delete(id);
  set({ overrides: next, movedAt: Date.now() });
}

/* ------------------------------------------------------------------------------------------ */
/* Bumps                                                                                      */
/* ------------------------------------------------------------------------------------------ */

interface Pending {
  toastId: number;
  commit: () => void;
  cancel: () => void;
}

const pending = new Map<string, Pending>();
/** Per order: the last request, so the next one waits for it. */
const chains = new Map<string, Promise<unknown>>();

function chained<T>(orderId: string, run: () => Promise<T>): Promise<T> {
  const before = chains.get(orderId) ?? Promise.resolve();
  const next = before.catch(() => {}).then(run);
  chains.set(orderId, next);
  void next.finally(() => {
    if (chains.get(orderId) === next) chains.delete(orderId);
  }).catch(() => {});
  return next;
}

async function send(api: PeniClient, slug: string, order: OrderDTO, action: BumpAction, token: number) {
  try {
    const saved = await chained(order.id, () => api.staff.transition(slug, order.id, { action }));
    if (snap.slug !== slug) return;
    touch();
    patchOrder(saved);
    dropOverride(order.id, token);
  } catch (e) {
    if (snap.slug !== slug) return;
    touch();
    dropOverride(order.id, token);
    haptic("error");
    toast(errorCopy.save(messageOf(e)), { tone: "danger" });
    void loadBoard(api, slug);
  }
}

/**
 * Moves the ticket now and sends the request when the 5s "Geri al" toast closes. One undo at a
 * time: a new bump (its toast replaces the old one) sends the previous bump straight away.
 */
export function bumpOrder(api: PeniClient, slug: string, order: OrderDTO, action: BumpAction): void {
  if (snap.slug !== slug) return;
  haptic("confirm");
  touch();
  const id = order.id;
  const token = ++bumpSeq;
  const overrides = new Map(snap.overrides).set(id, { status: statusAfter(action), at: new Date().toISOString(), token });
  set({ overrides, movedAt: Date.now() });

  let settled = false;
  const settle = () => {
    if (settled) return false;
    settled = true;
    if (pending.get(id) === entry) pending.delete(id);
    return true;
  };
  const entry: Pending = {
    toastId: 0,
    commit: () => {
      if (!settle()) return;
      void send(api, slug, order, action, token);
    },
    cancel: () => {
      if (!settle()) return;
      touch();
      dropOverride(id, token);
    },
  };
  // An older bump of this same ticket still waiting goes out first (its toast is about to be replaced).
  pending.get(id)?.commit();
  pending.set(id, entry);
  entry.toastId = toast(bumpToastText(order, action), {
    duration: UNDO_DURATION,
    action: { label: staffCopy.undo, onPress: entry.cancel },
    onClose: entry.commit,
  });
}

/** Sends every bump still waiting for its toast (the app is going to the background). */
export function flushBumps(): void {
  for (const p of [...pending.values()]) {
    p.commit();
    dismissToast(p.toastId);
  }
}

/** Reject: sent at once. A bump still waiting on this ticket is dropped first. Throws the API error. */
export async function rejectOrder(api: PeniClient, slug: string, order: OrderDTO, reason: string): Promise<void> {
  const waiting = pending.get(order.id);
  if (waiting) {
    waiting.cancel();
    dismissToast(waiting.toastId);
  }
  const saved = await chained(order.id, () => api.staff.transition(slug, order.id, { action: "reject", reason }));
  if (snap.slug !== slug) return;
  touch();
  patchOrder(saved);
  dropOverride(order.id);
}

/* ------------------------------------------------------------------------------------------ */
/* Pause and the till                                                                         */
/* ------------------------------------------------------------------------------------------ */

/** A duration pauses app orders [G20]; null resumes. Throws the API error (the caller toasts). */
export async function setPause(api: PeniClient, slug: string, value: PauseDuration | null): Promise<void> {
  const res = await api.staff.setPaused(slug, value);
  if (snap.slug !== slug) return;
  touch();
  patchData((d) => ({ ...d, cafe: { ...d.cafe, appOrderingPaused: res.appOrderingPaused, pausedUntil: res.pausedUntil } }));
}

/** Writes a till donation into the board's askı (the rail hangs the new items in the same render). */
export function applyTillDonation(next: { balancePeni: number; itemsAvailable: number; donatedPeni: number }): void {
  touch();
  patchData((d) => ({
    ...d,
    askida: {
      ...d.askida,
      balancePeni: next.balancePeni,
      itemsAvailable: next.itemsAvailable,
      donatedLast7DaysPeni: d.askida.donatedLast7DaysPeni + next.donatedPeni,
    },
  }));
}
