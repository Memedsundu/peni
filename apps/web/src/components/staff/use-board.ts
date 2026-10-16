"use client";

import { createPeniClient, PeniApiError, type OrderDTO, type StaffDashboardDTO } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast, UNDO_DURATION } from "@/components/ui";
import { peni, readStaffKey } from "@/lib/client";
import { bumpToastText, statusAfter, type BumpAction, type Override } from "./model";

/** Polling cadence while the tab is visible (§9.10: "every 4s"). */
export const POLL_MS = 4_000;

/**
 * Staff calls that must survive the tab closing: bumps flushed on `pagehide` go out with
 * `keepalive`, so the browser finishes them after the page is gone. The key is the one in use
 * when the bump was tapped, so a bump flushed by "Çıkış" still goes out signed.
 */
function keepaliveClient(staffKey: string | null) {
  return createPeniClient({
    baseUrl: "",
    getStaffKey: () => staffKey,
    fetch: (input, init) => fetch(input, { ...init, keepalive: true }),
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : errorCopy.generic;
}

export interface DashboardState {
  data: StaffDashboardDTO | null;
  /** The last poll failed; `data` still holds the last good board. */
  error: string | null;
  /** True until the first answer (or the first error). */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Swap in an order the server just returned (after a bump or a reject). */
  patchOrder: (order: OrderDTO) => void;
  patch: (fn: (d: StaffDashboardDTO) => StaffDashboardDTO) => void;
  /**
   * Call before a local change: a poll that was already in flight would bring the old board
   * back for one frame, so its answer is dropped and the next poll catches up.
   */
  touch: () => void;
}

/**
 * The dashboard, polled every 4s while the tab is visible and not at all while it is hidden
 * (it refreshes at once on return). Errors keep the last board on screen. A 401/403 means the
 * staff key no longer works: `onUnauthorized` sends the panel back to its gate.
 */
export function useStaffDashboard(slug: string, enabled: boolean, onUnauthorized: () => void): DashboardState {
  const [data, setData] = useState<StaffDashboardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => {
    unauthorized.current = onUnauthorized;
  }, [onUnauthorized]);

  const refresh = useCallback(async () => {
    const started = generation.current;
    try {
      const d = await peni.staff.dashboard(slug);
      if (generation.current !== started) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (e instanceof PeniApiError && (e.status === 401 || e.status === 403)) {
        unauthorized.current();
        return;
      }
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    // One loop at a time: every (re)start bumps `run`, and an older loop stops at its next step.
    let run = 0;
    const visible = () => document.visibilityState === "visible";
    const tick = async (id: number) => {
      if (id !== run || !visible()) return;
      await refresh();
      if (id === run && visible()) timer = window.setTimeout(() => void tick(id), POLL_MS);
    };
    const stop = () => {
      run += 1;
      window.clearTimeout(timer);
    };
    const start = () => {
      stop();
      void tick(run);
    };
    const onVisibility = () => (visible() ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refresh]);

  const touch = useCallback(() => {
    generation.current += 1;
  }, []);
  const patch = useCallback((fn: (d: StaffDashboardDTO) => StaffDashboardDTO) => setData((d) => (d ? fn(d) : d)), []);
  const patchOrder = useCallback(
    (order: OrderDTO) => patch((d) => ({ ...d, orders: d.orders.map((o) => (o.id === order.id ? order : o)) })),
    [patch],
  );

  return { data, error, loading, refresh, patchOrder, patch, touch };
}

interface Pending {
  commit: () => void;
  cancel: () => void;
}

export interface Bumps {
  overrides: ReadonlyMap<string, Override>;
  /** Move the ticket now; send the request when the 5s "Geri al" toast closes. */
  bump: (order: OrderDTO, action: BumpAction) => void;
  /** Reject is sent at once: the sheet was the confirmation. Throws the API error. */
  reject: (order: OrderDTO, reason: string) => Promise<void>;
}

/**
 * Deferred commits (§9.10 "Bump with undo", A12). Accept, ready, collect and no-show:
 * - the ticket moves at once (an override on top of the polled board);
 * - a toast "P-004 · Hazır" offers "Geri al" for 5s; undo removes the override and sends nothing;
 * - the request goes out when the toast closes, or straight away when another bump comes in
 *   (one undo at a time) or the page is hidden for good (`pagehide`, with `keepalive`);
 * - a failure toasts "Kaydedilemedi: {message}" and the ticket goes back to its column.
 */
export function useBumps(slug: string, board: DashboardState): Bumps {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(() => new Map());
  const pending = useRef(new Map<string, Pending>());
  const tokens = useRef(0);
  const { patchOrder, refresh, touch } = board;

  /** Removes the override `token` put there — not a newer bump on the same ticket. */
  const drop = useCallback((id: string, token?: number) => {
    setOverrides((prev) => {
      const current = prev.get(id);
      if (!current || (token !== undefined && current.token !== token)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const send = useCallback(
    async (order: OrderDTO, action: BumpAction, staffKey: string | null, token: number) => {
      try {
        const saved = await keepaliveClient(staffKey).staff.transition(slug, order.id, { action });
        touch();
        patchOrder(saved);
        drop(order.id, token);
      } catch (error) {
        touch();
        drop(order.id, token);
        toast.error(errorCopy.save(messageOf(error)));
        void refresh();
      }
    },
    [slug, touch, patchOrder, drop, refresh],
  );

  const flush = useCallback(() => {
    for (const p of [...pending.current.values()]) p.commit();
  }, []);

  const bump = useCallback(
    (order: OrderDTO, action: BumpAction) => {
      const id = order.id;
      // A second tap on a ticket whose bump is still waiting (a double tap at the counter, or a
      // tap on the copy fading out of its old column) is not a new bump: sending the first one
      // now would cost it its undo, and the repeat would only come back refused.
      if (pending.current.has(id)) return;
      // One undo at a time: the other tickets' waiting bumps go out now.
      flush();
      touch();
      const staffKey = readStaffKey();
      const token = ++tokens.current;
      setOverrides((prev) => new Map(prev).set(id, { status: statusAfter(action), at: new Date().toISOString(), token }));

      let settled = false;
      let toastId: string | number | undefined;
      const settle = () => {
        if (settled) return false;
        settled = true;
        pending.current.delete(id);
        return true;
      };
      const entry: Pending = {
        commit: () => {
          if (!settle()) return;
          if (toastId !== undefined) toast.dismiss(toastId);
          void send(order, action, staffKey, token);
        },
        cancel: () => {
          if (!settle()) return;
          if (toastId !== undefined) toast.dismiss(toastId);
          touch();
          drop(id, token);
        },
      };
      pending.current.set(id, entry);
      toastId = toast(bumpToastText(order, action), {
        duration: UNDO_DURATION,
        action: { label: staffCopy.undo, onClick: entry.cancel },
        onAutoClose: entry.commit,
        onDismiss: entry.commit,
      });
    },
    [flush, touch, send, drop],
  );

  // Closing or reloading the tab sends what is waiting (keepalive lets it finish).
  useEffect(() => {
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [flush]);

  const reject = useCallback(
    async (order: OrderDTO, reason: string) => {
      // A bump still waiting on this ticket is moot now: drop it rather than race the reject.
      pending.current.get(order.id)?.cancel();
      const saved = await peni.staff.transition(slug, order.id, { action: "reject", reason });
      touch();
      patchOrder(saved);
      drop(order.id);
    },
    [slug, touch, patchOrder, drop],
  );

  return { overrides, bump, reject };
}
