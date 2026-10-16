/**
 * Motion tokens (design-system.md §7.1). Components animate with `m.*` from "motion/react-m"
 * inside the root <LazyMotion strict> + <MotionConfig reducedMotion="user"> (app/providers.tsx).
 * UI motion is ≤300ms; the only exceptions are sheets (450ms), the coin flip (420ms) and toasts.
 * No scroll reveals, no list staggers, no infinite loops.
 */
export const ease = { outStrong: [0.23, 1, 0.32, 1], drawer: [0.32, 0.72, 0, 1] } as const;
export const spring = {
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0.15 },
  tap:    { type: "spring", visualDuration: 0.25, bounce: 0.3 },
  strike: { type: "spring", visualDuration: 0.35, bounce: 0.35 },
  hang:   { type: "spring", stiffness: 380, damping: 16 },
  seat:   { type: "spring", visualDuration: 0.3, bounce: 0.3 },
} as const;
export const tween = {
  ui:    { duration: 0.2,  ease: ease.outStrong },
  move:  { duration: 0.25, ease: ease.outStrong },
  state: { duration: 0.3,  ease: ease.outStrong },
} as const;
