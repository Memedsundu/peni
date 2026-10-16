import { PeniError } from "./errors";

/**
 * Lifecycle of an order placed from the app, before and until it is paid at the till.
 * Payment itself stays in the POS (Shelby): Peni only tracks the kitchen side.
 *
 *   submitted ──accept──▶ accepted ──ready──▶ ready ──collect──▶ collected
 *     │  │                  │                   │
 *     │  └─────reject───────┴──▶ rejected        └──no_show──▶ no_show
 *     └──cancel──▶ cancelled   (customer, only before the barista accepts)
 *
 *   "collect" also works straight from accepted, for a guest who is already at the till.
 */
export type FulfillmentStatus =
  | "submitted"
  | "accepted"
  | "ready"
  | "collected"
  | "rejected"
  | "cancelled"
  | "no_show";

export type FulfillmentAction = "accept" | "reject" | "ready" | "collect" | "no_show" | "cancel";

export type Actor = "customer" | "staff" | "system";

export interface FulfillmentState {
  status: FulfillmentStatus;
  rejectionReason: string | null;
  submittedAt: Date;
  acceptedAt: Date | null;
  readyAt: Date | null;
  closedAt: Date | null;
}

export type NotificationTemplate =
  | "order_accepted"
  | "order_ready"
  | "order_rejected"
  | "order_no_show"
  | "order_received";

export interface TransitionResult {
  state: FulfillmentState;
  /** Push notification to send to the customer, if any. */
  notify: NotificationTemplate | null;
  /** True when peni and askı items reserved for the order must be released. */
  releaseReservations: boolean;
}

const RULES: Record<FulfillmentAction, { from: FulfillmentStatus[]; to: FulfillmentStatus; actors: Actor[] }> = {
  accept: { from: ["submitted"], to: "accepted", actors: ["staff"] },
  reject: { from: ["submitted", "accepted"], to: "rejected", actors: ["staff"] },
  ready: { from: ["accepted"], to: "ready", actors: ["staff"] },
  // "collect" is fired by the POS webhook when the order is paid, or by staff.
  collect: { from: ["accepted", "ready"], to: "collected", actors: ["staff", "system"] },
  no_show: { from: ["ready"], to: "no_show", actors: ["staff", "system"] },
  cancel: { from: ["submitted"], to: "cancelled", actors: ["customer"] },
};

const NOTIFY: Partial<Record<FulfillmentAction, NotificationTemplate>> = {
  accept: "order_accepted",
  ready: "order_ready",
  reject: "order_rejected",
  no_show: "order_no_show",
};

export const TERMINAL_STATUSES: readonly FulfillmentStatus[] = ["collected", "rejected", "cancelled", "no_show"];

export interface PrepTimeStats {
  sampleSize: number;
  /** Median accept → ready time, whole minutes (at least 1). */
  medianMinutes: number;
  /** Interquartile range, whole minutes: "genelde 5–8 dk". `low <= median <= high`. */
  lowMinutes: number;
  highMinutes: number;
}

/** No ETA is ever shown without this much real history. */
export const MIN_PREP_SAMPLES = 20;

/**
 * How long a café really takes, from the barista's "accept" tap to their "ready"
 * tap, over collected orders. Returns null below `minSamples`: Peni never shows
 * an ETA that is not backed by the café's own taps.
 */
export function prepTimeStats(
  orders: Pick<FulfillmentState, "status" | "acceptedAt" | "readyAt">[],
  minSamples = MIN_PREP_SAMPLES,
): PrepTimeStats | null {
  const minutes = orders
    .filter((o) => o.status === "collected" && o.acceptedAt && o.readyAt && o.readyAt > o.acceptedAt)
    .map((o) => (o.readyAt!.getTime() - o.acceptedAt!.getTime()) / 60_000)
    .sort((a, b) => a - b);
  if (minutes.length < Math.max(1, minSamples)) return null;

  const median = Math.max(1, Math.round(quantile(minutes, 0.5)));
  const low = Math.max(1, Math.min(median, Math.floor(quantile(minutes, 0.25))));
  const high = Math.max(median, Math.ceil(quantile(minutes, 0.75)));
  return { sampleSize: minutes.length, medianMinutes: median, lowMinutes: low, highMinutes: high };
}

/** Linear-interpolated quantile of an ascending, non-empty list. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

export function initialFulfillment(now: Date): FulfillmentState {
  return { status: "submitted", rejectionReason: null, submittedAt: now, acceptedAt: null, readyAt: null, closedAt: null };
}

export function allowedActions(status: FulfillmentStatus, actor: Actor): FulfillmentAction[] {
  return (Object.keys(RULES) as FulfillmentAction[]).filter(
    (action) => RULES[action].from.includes(status) && RULES[action].actors.includes(actor),
  );
}

export function transition(
  state: FulfillmentState,
  action: FulfillmentAction,
  actor: Actor,
  now: Date,
  reason?: string,
): TransitionResult {
  const rule = RULES[action];
  if (!rule.from.includes(state.status) || !rule.actors.includes(actor)) {
    throw new PeniError("INVALID_TRANSITION", `${actor} cannot ${action} an order that is ${state.status}`);
  }
  if (action === "reject" && !reason?.trim()) {
    throw new PeniError("INVALID_TRANSITION", "A rejection needs a reason the customer will see");
  }

  const next: FulfillmentState = { ...state, status: rule.to };
  if (action === "accept") next.acceptedAt = now;
  if (action === "ready") next.readyAt = now;
  if (action === "reject") next.rejectionReason = reason!.trim();
  if (TERMINAL_STATUSES.includes(rule.to)) next.closedAt = now;

  return {
    state: next,
    notify: NOTIFY[action] ?? null,
    releaseReservations: rule.to === "rejected" || rule.to === "cancelled" || rule.to === "no_show",
  };
}
