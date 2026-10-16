/**
 * Internals shared by the brand components. Not exported from the barrel.
 */
import { useId } from "react";
import type { ViewProps } from "react-native";
import { ReduceMotion } from "react-native-reanimated";
import { timings } from "@/lib/motion";

/**
 * The §7.2 reduced-motion stand-in: a 150ms opacity fade. Reanimated skips every animation
 * gated by `ReduceMotion.System` when Reduce Motion is on (it jumps to the end), so the
 * stand-ins opt out with `Never`: they move nothing, and without them the coin's crossfade
 * and the cup's fade would not be seen at all. Use it ONLY on opacity.
 */
export const REDUCED_FADE = { ...timings.reduced, reduceMotion: ReduceMotion.Never };
/** For `withDelay` / `withSequence` wrapped around `REDUCED_FADE`. */
export const PLAY_ALWAYS = ReduceMotion.Never;

/**
 * Every motif is decorative (§6): hidden from VoiceOver, TalkBack and the web accessibility
 * tree. The real text always sits beside it.
 *
 * `aria-hidden` alone is enough: React Native's `View` maps it to `accessibilityElementsHidden`
 * (iOS) and `importantForAccessibility="no-hide-descendants"` (Android), and react-native-web
 * renders it as is. Spread this on a `View` / `Animated.View` only, never on an `Svg` (on the
 * web, react-native-svg would pass unknown native props to the DOM).
 */
export const hidden = {
  accessible: false,
  "aria-hidden": true,
} as const satisfies Partial<ViewProps>;

/**
 * A `useId()` value that is safe inside `url(#…)` and `href="#…"` references. Gradient, pattern
 * and path ids MUST be unique per instance (§6), or two coins on one screen share a gradient
 * (and on the web, the second coin silently paints with the first one's).
 */
export function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) out.push(i);
  return out;
}

/** Rounds to 3 decimals so generated path data stays short and stable. */
export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
