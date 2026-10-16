import type { CSSProperties } from "react";
import { cx } from "./cx";

export type SkeletonRadius = 0 | 4 | 10 | 14 | 22 | "full";

const RADIUS: Record<`${SkeletonRadius}`, string> = {
  "0": "rounded-none",
  "4": "rounded-[4px]",
  "10": "rounded-[10px]",
  "14": "rounded-[14px]",
  "22": "rounded-[22px]",
  full: "rounded-full",
};

export interface SkeletonProps {
  /** The exact final size: `h-4 w-24`, `aspect-[16/7] w-full` (§9: skeletons have the real geometry). */
  className?: string;
  /** The radius of the element it stands in for. Default 4 (a line of text). */
  radius?: SkeletonRadius;
  style?: CSSProperties;
}

/**
 * Skeleton (design-system.md §12.2): a static `surface-2` block — no shimmer, no pulse (no
 * infinite animation exists in this system). `aria-hidden`; put `aria-busy="true"` on the
 * region it fills, and drop it when the content lands.
 */
export function Skeleton({ className, radius = 4, style }: SkeletonProps) {
  return <span aria-hidden className={cx("block bg-surface-2", RADIUS[`${radius}`], className)} style={style} />;
}
