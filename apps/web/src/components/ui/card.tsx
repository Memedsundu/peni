import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "raised" | "aski" | "masa" | "peni" | "warning";
export type CardPadding = "none" | "md";

const TONE: Record<CardTone, string> = {
  raised: "bg-surface shadow-raised",
  // Tinted panels are flat: no shadow, no border (§5).
  aski: "bg-aski-soft",
  masa: "bg-masa-soft",
  peni: "bg-peni-soft",
  warning: "bg-warning-soft",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside" | "li" | "ul" | "ol" | "header" | "footer" | "form";
  tone?: CardTone;
  /** `md`: 16px on phones, 20px from 768px (§5). `none` for cards that hold rows edge to edge. */
  padding?: CardPadding;
  children?: ReactNode;
}

/**
 * Card (design-system.md §12.2): radius 14. `raised` is `bg-surface shadow-raised`; the askı,
 * masa, peni and warning tones are flat tinted panels. Cards NEVER nest inside cards: a raised
 * card holds flat rows (`RowGroup`).
 */
export function cardClasses({ tone = "raised", padding = "md" }: { tone?: CardTone; padding?: CardPadding } = {}): string {
  return cx("rounded-[14px] text-ink", TONE[tone], padding === "md" && "p-4 md:p-5");
}

export function Card({ as = "div", tone = "raised", padding = "md", className, children, ...rest }: CardProps) {
  // Every allowed tag takes the shared HTMLAttributes; typing it as one keeps JSX simple.
  const Tag = as as "div";
  return (
    <Tag {...(rest as HTMLAttributes<HTMLDivElement>)} className={cx(cardClasses({ tone, padding }), className)}>
      {children}
    </Tag>
  );
}
