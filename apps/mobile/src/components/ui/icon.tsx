/**
 * Icons inside primitives (design-system.md §5 Icons): lucide-react-native 1.58.
 *
 * Strokes: 1.75 at 20 and 24pt; 1.5 at 32pt and above (empty states); at 16pt the stroke is
 * "absolute" — 1.75pt on screen, not 1.75 of the 24 grid scaled down. Icons are decorative:
 * the text label or `accessibilityLabel` beside them always carries the meaning.
 */
import type { LucideIcon } from "lucide-react-native";
import { isValidElement, type ReactElement } from "react";

/** A lucide component (preferred), or a ready element for anything custom (a brand glyph). */
export type IconProp = LucideIcon | ReactElement;

export type IconSize = 16 | 20 | 24 | 32;

/** The §5 stroke for a size, already corrected for lucide's 24-unit grid at 16pt. */
export function iconStroke(size: number): number {
  if (size >= 32) return 1.5;
  if (size <= 16) return (1.75 * 24) / size;
  return 1.75;
}

export interface IconProps {
  icon: IconProp;
  size?: IconSize | number;
  color: string;
  /** Fill for "on" states (a reacted heart). Lucide icons are stroke-only by default. */
  fill?: string;
}

export function Icon({ icon, size = 20, color, fill }: IconProps) {
  if (isValidElement(icon)) return icon;
  const Glyph = icon as LucideIcon;
  return (
    <Glyph
      size={size}
      color={color}
      fill={fill ?? "none"}
      strokeWidth={iconStroke(size)}
      pointerEvents="none"
    />
  );
}

/**
 * A token colour with an alpha channel, as `#RRGGBBAA` (React Native and react-native-web both
 * read it). Used for washes on fixed fills (the press header's pressed state), where a token
 * colour must sit at a fraction of its strength. Never for text, never for disabled states.
 */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const base = hex.length === 9 ? hex.slice(0, 7) : hex;
  return `${base}${a}`;
}
