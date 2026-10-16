/**
 * Motion tokens (design-system.md §7.1), Reanimated 4.7.1.
 *
 * Rules: UI motion is ≤300ms (sheets 450, the coin flip 420, toasts excepted). No scroll
 * reveals, no list staggers, no infinite loops. Every Reanimated CSS animation or transition
 * is gated by `useReducedMotion()`; layout animations (`entering` / `exiting`) get
 * `.reduceMotion(ReduceMotion.System)`. JS callbacks from worklets use `scheduleOnRN`
 * (react-native-worklets), never `runOnJS`.
 */
import {
  Easing,
  ReduceMotion,
  useReducedMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

export { ReduceMotion, useReducedMotion };

export const EASE_OUT_STRONG = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_DRAWER = Easing.bezier(0.32, 0.72, 0, 1);

/** §7.1, verbatim. */
export const springs = {
  snappy: { duration: 250, dampingRatio: 0.85 },
  tap: { duration: 250, dampingRatio: 0.6 },
  strike: { duration: 350, dampingRatio: 0.55 },
  hang: { stiffness: 380, damping: 16, mass: 1 },
  seat: { duration: 300, dampingRatio: 0.6 },
} satisfies Record<string, WithSpringConfig>;

export type SpringName = keyof typeof springs;

/** Durations in ms (the web `--dur-*` variables, plus the named exceptions). */
export const durations = {
  /** A1 press scale in and out. */
  press: 100,
  ui: 200,
  move: 250,
  state: 300,
  sheet: 450,
  /** A7 coin flip. */
  flip: 420,
  /** A17 CountWheel digits. */
  countWheel: 400,
  /** The reduced-motion stand-in: an opacity fade or crossfade. */
  reduced: 150,
  /** A18 toast in / out. */
  toastIn: 200,
  toastOut: 150,
} as const;

/** Timing configs with the house curve. */
export const timings = {
  press: { duration: durations.press, easing: EASE_OUT_STRONG },
  ui: { duration: durations.ui, easing: EASE_OUT_STRONG },
  move: { duration: durations.move, easing: EASE_OUT_STRONG },
  state: { duration: durations.state, easing: EASE_OUT_STRONG },
  /** A17: digits slide ±18 over 400ms. */
  countWheel: { duration: durations.countWheel, easing: Easing.out(Easing.cubic) },
  /** Reduced motion: opacity only. */
  reduced: { duration: durations.reduced, easing: Easing.linear },
} satisfies Record<string, WithTimingConfig>;

/** A1 `press`: the scale a pressed control settles at. A2 `stepper-tap` uses `STEPPER_SCALE`. */
export const PRESS_SCALE = 0.97;
export const STEPPER_SCALE = 0.94;

/** A13: the new-ticket bar stays fully visible for 10s, then fades over 600ms. */
export const NEW_TICKET = { holdMs: 10_000, fadeMs: 600 } as const;

/** True when motion should be replaced by its §7.2 reduced-motion stand-in. */
export function useMotionReduced(): boolean {
  return useReducedMotion();
}
