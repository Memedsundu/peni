"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import { cx, disabledLook, focusRing, pressMotion, tappable } from "./cx";
import { Icon, type IconProp } from "./icon";

export type ChipTone = "neutral" | "peni" | "aski" | "masa" | "success" | "warning" | "danger";
export type ChipKind = "choice" | "status" | "tag";

/** Each tone is its soft fill with its own `-ink` text (§3.2: never a mid tone on its own soft). */
const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  peni: "bg-peni-soft text-peni-ink",
  aski: "bg-aski-soft text-aski-ink",
  masa: "bg-masa-soft text-masa-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger",
};

/**
 * Status is never colour alone (§3.2): a coloured status chip with no icon gets one.
 * Danger is always `CircleAlert` (D1). Pass the icon from the spec table where it names one
 * ("bekliyor" → `Clock`, "sana döndü" → `Undo2`).
 */
const DEFAULT_ICON: Partial<Record<ChipTone, IconProp>> = { success: Check, warning: CircleAlert, danger: CircleAlert };

interface ChipCommon {
  tone?: ChipTone;
  icon?: IconProp;
  children: ReactNode;
  className?: string;
}

export interface StatusChipProps extends ChipCommon {
  /** 24px, radius 4, 13px 600, icon + word ("Teslim edildi", "3 dk", "ikram"). The default kind. */
  kind?: "status";
}

export interface TagChipProps extends ChipCommon {
  /** `legend` caps, radius 4 ("TÜKENDİ", "GEÇTİ", "DENEME"). */
  kind: "tag";
}

type ChoiceOwn = ChipCommon & {
  /** 44px, radius 10; selected = a 2px ink border on `surface`. */
  kind: "choice";
  selected?: boolean;
  /** Disables the chip and renders the reason under its label ("Bakiyen 25", "Askıda yeterli peni yok"). */
  disabledReason?: ReactNode;
};

export type ChoiceChipProps =
  | (ChoiceOwn & Omit<ComponentPropsWithRef<"button">, keyof ChoiceOwn | "disabled"> & { href?: undefined })
  | (ChoiceOwn & Omit<ComponentPropsWithRef<typeof Link>, keyof ChoiceOwn | "href"> & { href: ComponentPropsWithRef<typeof Link>["href"] });

export type ChipProps = StatusChipProps | TagChipProps | ChoiceChipProps;

/**
 * Chip (design-system.md §12.2).
 *
 * - `status` (default): a 24px label chip in a tone, always with an icon for coloured tones.
 * - `tag`: a `legend` caps tag, radius 4.
 * - `choice`: a 44px toggle (`aria-pressed`) or a link; disabled with a visible reason.
 *
 * Put choice chips in a `ChipGroup` so the set has a name.
 */
export function Chip(props: ChipProps) {
  if (props.kind === "choice") return <ChoiceChip {...props} />;
  const { kind = "status", tone = "neutral", icon, children, className } = props;
  const glyph = icon ?? (kind === "status" ? DEFAULT_ICON[tone] : undefined);

  if (kind === "tag") {
    return (
      <span className={cx("legend inline-flex items-center gap-1 rounded-[4px] px-2 py-1 whitespace-nowrap", TONE[tone], className)}>
        {glyph != null && <Icon icon={glyph} size={16} />}
        {children}
      </span>
    );
  }
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1 rounded-[4px] px-2 text-meta font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {glyph != null && <Icon icon={glyph} size={16} />}
      {children}
    </span>
  );
}

function ChoiceChip(props: ChoiceChipProps) {
  const { kind: _kind, tone: _tone, icon, selected = false, disabledReason, children, className, ...rest } = props;
  const disabled = disabledReason != null && disabledReason !== false;

  const classes = cx(
    "inline-flex min-h-11 flex-col items-start justify-center gap-0.5 rounded-[10px] border-[1.5px] px-3.5 py-2 text-left",
    tappable,
    focusRing,
    disabled
      ? disabledLook
      : cx(
          pressMotion,
          "bg-surface text-ink active:bg-surface-2",
          // 1.5px border + 0.5px inset ring = the 2px ink selection, with no layout shift.
          selected ? "border-ink inset-ring-[0.5px] inset-ring-ink" : "border-line-strong hover:bg-surface-2",
        ),
    className,
  );
  const body = (
    <>
      <span className="inline-flex items-center gap-2 text-button">
        {icon != null && <Icon icon={icon} size={20} />}
        {children}
      </span>
      {disabled && <span className="text-meta text-ink-2">{disabledReason}</span>}
    </>
  );

  if (rest.href != null) {
    const { href, ...linkRest } = rest as Omit<Extract<ChoiceChipProps, { href: unknown }>, keyof ChoiceOwn>;
    return (
      <Link href={href} {...linkRest} className={classes}>
        {body}
      </Link>
    );
  }

  const { onClick, type = "button", ...buttonRest } = rest as Omit<ComponentPropsWithRef<"button">, keyof ChoiceOwn | "disabled">;
  return (
    <button
      type={type}
      {...buttonRest}
      // Focusable while disabled, so the reason inside it can be found and read.
      aria-disabled={disabled || undefined}
      aria-pressed={disabled ? undefined : selected}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={classes}
    >
      {body}
    </button>
  );
}

/** A named set of choice chips ("Hangisi?", "Ne bırakıyorsun?"). Wraps, 8px gaps. */
export function ChipGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  );
}

/** The 8px status dot for chips like "Sipariş alıyor" (decorative; the word carries the meaning). */
export function StatusDot({ tone = "success", className }: { tone?: "success" | "warning" | "masa"; className?: string }) {
  const fill = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-masa";
  return <span aria-hidden className={cx("inline-block size-2 shrink-0 rounded-full", fill, className)} />;
}
