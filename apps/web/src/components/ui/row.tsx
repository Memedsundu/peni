"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useId, type ComponentPropsWithRef, type MouseEvent, type ReactNode } from "react";
import { cardClasses, type CardTone } from "./card";
import { colorMotion, cx, focusRingInset, tappable } from "./cx";

const InList = createContext(false);

export interface RowProps {
  /** A navigation row: renders a `Link`, with an `ArrowRight` at the end unless `end` or `arrow={false}`. */
  href?: ComponentPropsWithRef<typeof Link>["href"];
  /** An action row: renders a full-width `<button>`. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Leading visual: a 28px coin, an avatar, a 24px icon. */
  start?: ReactNode;
  /** Trailing content: an amount, a chip, a switch value. */
  end?: ReactNode;
  /** The row's words: `title` in `text-body`, `meta` under it in `text-meta ink-2`. */
  title?: ReactNode;
  meta?: ReactNode;
  /** Free content, after title and meta. */
  children?: ReactNode;
  arrow?: boolean;
  /** Action rows only. Show why in `meta`. */
  disabled?: boolean;
  "aria-label"?: string;
  "aria-current"?: ComponentPropsWithRef<"a">["aria-current"];
  target?: string;
  rel?: string;
  className?: string;
}

/**
 * Row (design-system.md §12.2): min 56px, padding 12 × 16. Inside a `RowGroup` it is a list
 * item and the group draws the `line` dividers.
 *
 * Rows press by stepping their fill to `surface-2` (the reduced-motion form of A1) and never
 * scale: a row is full-bleed inside its card, and a shrinking row would pull away from the
 * dividers above and below it. The focus ring is inset, because the card clips its corners.
 */
export function Row({
  href,
  onClick,
  start,
  end,
  title,
  meta,
  children,
  arrow,
  disabled = false,
  className,
  ...aria
}: RowProps) {
  const inList = useContext(InList);
  const interactive = href != null || onClick != null;
  const showArrow = arrow ?? (href != null && end == null);

  const inner = (
    <>
      {start != null && <span className="flex shrink-0 items-center">{start}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        {title != null && <span className={cx("text-body", disabled ? "text-ink-2" : "text-ink")}>{title}</span>}
        {meta != null && <span className="text-meta text-ink-2">{meta}</span>}
        {children}
      </span>
      {end != null && <span className="flex shrink-0 items-center gap-2 text-body">{end}</span>}
      {showArrow && <ArrowRight aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0 text-ink-2" />}
    </>
  );

  const base = cx("flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left", className);
  const pressable = cx(tappable, colorMotion, focusRingInset, "hover:bg-surface-2/50 active:bg-surface-2");

  let row: ReactNode;
  if (href != null) {
    row = (
      <Link href={href} {...aria} className={cx(base, pressable)}>
        {inner}
      </Link>
    );
  } else if (onClick != null) {
    row = (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        className={cx(base, disabled ? "cursor-not-allowed" : pressable)}
      >
        {inner}
      </button>
    );
  } else {
    row = (
      <div aria-label={aria["aria-label"]} className={base}>
        {inner}
      </div>
    );
  }

  return inList ? <li className={interactive ? "flex" : undefined}>{row}</li> : row;
}

export interface RowGroupProps {
  /** A `legend` heading over the card ("YİYECEK"); it also names the list. */
  title?: ReactNode;
  titleAs?: "h2" | "h3" | "h4" | "p";
  /** `raised` (default) or a flat tint. Never put a RowGroup inside another card. */
  tone?: CardTone;
  /**
   * No card at all: just rows between `line` rules (top and bottom too). For lists that already
   * sit on a surface — a sheet, a fiş, a card. Rows keep their 16px padding; bleed the group to
   * the container's edges with a negative margin (`-mx-4 md:-mx-6` in a Sheet).
   */
  flat?: boolean;
  className?: string;
  children: ReactNode;
}

/** One card of flat rows with `line` dividers (design-system.md §5: a raised card holds flat rows). */
export function RowGroup({ title, titleAs: Title = "h3", tone = "raised", flat = false, className, children }: RowGroupProps) {
  const titleId = useId();
  const list = (
    <ul
      aria-labelledby={title != null ? titleId : undefined}
      className={cx(
        flat ? "border-y border-line" : cx(cardClasses({ tone, padding: "none" }), "overflow-hidden"),
        "divide-y divide-line",
        title == null && className,
      )}
    >
      <InList.Provider value={true}>{children}</InList.Provider>
    </ul>
  );
  if (title == null) return list;
  return (
    <section className={className}>
      <Title id={titleId} className="mb-2 legend text-ink-2">
        {title}
      </Title>
      {list}
    </section>
  );
}
