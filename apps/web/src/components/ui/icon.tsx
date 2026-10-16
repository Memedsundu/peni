import { isValidElement, type ComponentType, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * Anything that draws like a lucide icon: lucide-react components, and our brand glyphs
 * (`CoinGlyph`, `DeviceGlyph`, …), which take only `className`.
 */
export type IconComponent = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * An icon slot accepts either a component (`icon={Gift}`, the usual form in client code) or an
 * element (`icon={<Gift strokeWidth={1.75} />}`). Pass an element when the parent is a Server
 * Component: a component reference is a function and can't cross the server → client boundary.
 * A component is sized and stroked by the slot; an element is only sized (give it its stroke).
 */
export type IconProp = IconComponent | ReactNode;

export type IconSize = 16 | 20 | 24 | 32;

const SIZE_CLASS: Record<IconSize, string> = { 16: "size-4", 20: "size-5", 24: "size-6", 32: "size-8" };

function isComponent(icon: unknown): icon is IconComponent {
  if (typeof icon === "function") return true;
  // forwardRef / memo components (lucide icons are forwardRef objects).
  return typeof icon === "object" && icon !== null && !isValidElement(icon) && "$$typeof" in icon;
}

/**
 * Renders an icon slot with the §5 stroke rules: 1.75 at 20 and 24px, 1.5 at 32px and above,
 * and `absoluteStrokeWidth` at 16px. Icons are always `aria-hidden`; the label is the text or
 * the `aria-label` beside them.
 */
export function Icon({ icon, size = 20, className }: { icon: IconProp; size?: IconSize; className?: string }) {
  if (icon == null || icon === false || icon === true) return null;
  if (isComponent(icon)) {
    const Glyph = icon;
    return (
      <Glyph
        aria-hidden
        size={size}
        strokeWidth={size >= 32 ? 1.5 : 1.75}
        absoluteStrokeWidth={size === 16}
        className={cx("shrink-0", SIZE_CLASS[size], className)}
      />
    );
  }
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center [&>svg]:size-full", SIZE_CLASS[size], className)}>
      {icon as ReactNode}
    </span>
  );
}
