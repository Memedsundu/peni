"use client";

import Link from "next/link";
import type { ComponentPropsWithRef } from "react";
import { cx, disabledLook, focusRing, pressMotion, tappable } from "./cx";
import { Icon, type IconProp, type IconSize } from "./icon";

export type IconButtonVariant = "secondary" | "quiet" | "press";
export type IconButtonSize = 44 | 48 | 56;

const VARIANT: Record<IconButtonVariant, string> = {
  secondary: "border-[1.5px] border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2",
  quiet: "text-ink hover:bg-surface-2 active:bg-surface-2",
  // On the press header (§8.3): `on-press` everywhere, a 10% wash for hover and press.
  press: "text-on-press hover:bg-on-press/10 active:bg-on-press/10",
};

const SIZE: Record<IconButtonSize, string> = { 44: "size-11", 48: "size-12", 56: "size-14" };

export function iconButtonClasses({
  variant = "quiet",
  size = 44,
  disabled = false,
}: { variant?: IconButtonVariant; size?: IconButtonSize; disabled?: boolean } = {}): string {
  return cx(
    "relative inline-flex shrink-0 items-center justify-center rounded-full",
    tappable,
    focusRing,
    SIZE[size],
    disabled ? disabledLook : VARIANT[variant],
    !disabled && pressMotion,
  );
}

interface IconButtonOwnProps {
  /** Required: becomes the `aria-label` ("Kapat", "Peni kodum", "Latte ekle"). */
  label: string;
  icon: IconProp;
  variant?: IconButtonVariant;
  /** Hit and visual size; never below 44. */
  size?: IconButtonSize;
  /** 20 by default (24 at size 56). */
  iconSize?: IconSize;
  /** For toggles (sound on/off, heart): sets `aria-pressed`. */
  pressed?: boolean;
  className?: string;
}

type NativeProps = IconButtonOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof IconButtonOwnProps | "children" | "aria-label"> & { href?: undefined };
type LinkProps = IconButtonOwnProps &
  Omit<ComponentPropsWithRef<typeof Link>, keyof IconButtonOwnProps | "children" | "aria-label" | "href"> & {
    href: ComponentPropsWithRef<typeof Link>["href"];
    disabled?: never;
  };

export type IconButtonProps = NativeProps | LinkProps;

/**
 * Round icon button (design-system.md §12.2): 44px by default, `secondary` (bordered), `quiet`
 * (transparent) or `press` (staff header). The icon is `aria-hidden`; `label` is the name.
 * An icon button has no room for a visible disabled reason: the screen that disables one must
 * say why next to it.
 */
export function IconButton(props: IconButtonProps) {
  const { label, icon, variant = "quiet", size = 44, iconSize, pressed, className, ...rest } = props;
  const glyph = <Icon icon={icon} size={iconSize ?? (size === 56 ? 24 : 20)} />;

  if (rest.href != null) {
    const { href, ...linkRest } = rest as Omit<LinkProps, keyof IconButtonOwnProps>;
    return (
      <Link href={href} {...linkRest} aria-label={label} className={cx(iconButtonClasses({ variant, size }), className)}>
        {glyph}
      </Link>
    );
  }

  const { disabled = false, type = "button", ...buttonRest } = rest as Omit<NativeProps, keyof IconButtonOwnProps>;
  return (
    <button
      type={type}
      {...buttonRest}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className={cx(iconButtonClasses({ variant, size, disabled }), className)}
    >
      {glyph}
    </button>
  );
}
