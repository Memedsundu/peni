import type { CafeHue } from "@peni/brand/tokens";
import { cx } from "./_cx";
import { CafeHueBand } from "./cafe-hue-band";

/*
 * Fiş, the printed slip (design-system.md §6.3): order status, gift, staff ticket.
 *
 * order / gift: a `surface` slip with 14px top corners and a scalloped bottom edge cut by a
 * CSS mask (`.fis` in globals.css). A mask clips box-shadow, so the shadow sits on the
 * `.fis-shadow` wrapper as a filter. Head: Oxford rule in ink, 8px, then the legend in `plate`.
 * tone="ready": the whole slip turns `success`; ink, ink-2, line-strong and the focus ring are
 * redefined to their on-success values inside it, with a 300ms colour transition (A11).
 *
 * ticket (staff): no Oxford rule and no scallop. A raised card with a 4px café-colourway band.
 */

export interface FisProps {
  variant?: "order" | "gift" | "ticket";
  tone?: "default" | "ready";
  /** "MODA KAHVESİ · SİPARİŞ", "ISMARLAMA · MODA KAHVESİ" (already upper-cased: use `trUpper` or the copy helpers). */
  legend?: React.ReactNode;
  /** Ticket band: the café, for its colourway. */
  slug?: string;
  hue?: CafeHue | null;
  as?: "div" | "article" | "section" | "li";
  className?: string;
  /** Classes for the slip itself (padding, gaps). */
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function Fis({
  variant = "order",
  tone = "default",
  legend,
  slug,
  hue,
  as: Tag = "div",
  className,
  bodyClassName,
  children,
}: FisProps) {
  if (variant === "ticket") {
    return (
      <Tag className={cx("relative flex flex-col overflow-hidden rounded-[14px] bg-surface text-ink shadow-raised", className)}>
        {slug && <CafeHueBand slug={slug} hue={hue} size={4} />}
        <div className={cx("@container flex flex-col p-4 md:p-5", bodyClassName)}>
          {legend && <p className="plate text-plate text-ink-2">{legend}</p>}
          {children}
        </div>
      </Tag>
    );
  }

  const ready = tone === "ready";
  return (
    <Tag className={cx("fis-shadow", className)}>
      <div
        className={cx("fis flex flex-col", bodyClassName)}
        data-tone={ready ? "ready" : undefined}
        data-variant={variant}
        // `--paper` is the slip's own colour, for anything that must sit opaque on it (status track stops).
        style={{ "--paper": ready ? "var(--success)" : "var(--surface)" } as React.CSSProperties}
      >
        <div aria-hidden className="rule-oxford shrink-0" />
        {legend && <p className="plate mt-2 text-plate text-ink-2">{legend}</p>}
        {children}
      </div>
    </Tag>
  );
}

/** The dashed rule between lines and totals: 1.5px dashed `line-strong`. */
export function FisDivider({ className }: { className?: string }) {
  return <hr className={cx("my-3 border-0 border-t-[1.5px] border-dashed border-line-strong", className)} />;
}

/**
 * One printed line: label left, amount right, tabular. `muted` is for deductions ("Peni −₺90",
 * "İkram −₺30"): `ink-2`, the same for peni and askı, never coloured.
 */
export function FisRow({
  label,
  value,
  muted = false,
  strong = false,
  className,
}: {
  label: React.ReactNode;
  value?: React.ReactNode;
  muted?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-baseline justify-between gap-4",
        muted ? "text-ink-2" : "text-ink",
        strong ? "text-button" : "text-body",
        className,
      )}
    >
      <span className="min-w-0">{label}</span>
      {value !== undefined && <span className="shrink-0 font-semibold tabular-nums">{value}</span>}
    </div>
  );
}
