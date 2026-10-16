"use client";

import { cartCopy } from "@peni/brand/copy";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, type ComponentPropsWithRef, type MouseEvent, type ReactNode } from "react";
import { cx, disabledLook, focusRing, pressMotion, tappable } from "./cx";
import { Icon, type IconProp } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "aski" | "danger-quiet";
/** sm 44 · md 48 · lg 56 (staff primary actions are lg). */
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  // Ink is action (§1): every primary fill is ink. Copper is NEVER a button colour (§3.2).
  primary: "bg-primary text-on-primary hover:bg-primary-pressed active:bg-primary-pressed",
  secondary: "border-[1.5px] border-line-strong bg-surface text-ink hover:bg-surface-2 active:bg-surface-2",
  quiet: "text-ink decoration-[1.5px] underline-offset-[5px] hover:underline active:bg-surface-2",
  aski: "bg-aski text-on-aski hover:bg-aski-pressed active:bg-aski-pressed",
  "danger-quiet": "text-danger decoration-[1.5px] underline-offset-[5px] hover:underline active:bg-danger-soft",
};

/*
 * Heights are minimums: a label that has to wrap at 360px grows the button instead of being
 * clipped. Quiet buttons keep 12px side padding (not 20) so their text lines up with the
 * content edge they sit under; the 44px hit height is unchanged.
 */
const SIZE: Record<ButtonSize, string> = { sm: "min-h-11 py-2", md: "min-h-12 py-2.5", lg: "min-h-14 py-3" };

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * The Button look as a class string, for elements that must stay someone else's (a Base UI
 * `Menu.Trigger`, a `<label>` over a file input). Prefer `<Button>`.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  disabled = false,
  loading = false,
}: ButtonClassOptions = {}): string {
  const quiet = variant === "quiet" || variant === "danger-quiet";
  return cx(
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-[10px] text-center text-button",
    tappable,
    focusRing,
    SIZE[size],
    quiet ? "px-3" : "px-5",
    fullWidth && "w-full",
    disabled && !loading ? disabledLook : VARIANT[variant],
    !disabled && !loading && pressMotion,
    loading && "cursor-progress",
  );
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** In flight: a spinner and "Gönderiliyor…" (or `loadingLabel`); clicks are ignored. */
  loading?: boolean;
  loadingLabel?: string;
  iconStart?: IconProp;
  iconEnd?: IconProp;
  fullWidth?: boolean;
  /**
   * Why the button can't be used ("Masa doldu", "Bakiyen 75"). It is shown under the button and
   * read with it, and the button stays focusable (`aria-disabled`) so the reason can be found.
   * A disabled button with no reason uses the native `disabled` attribute.
   */
  disabledReason?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type NativeButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithRef<"button">, keyof ButtonOwnProps> & { href?: undefined };

type LinkButtonProps = ButtonOwnProps &
  Omit<ComponentPropsWithRef<typeof Link>, keyof ButtonOwnProps | "href"> & {
    /** Renders a next/link `Link` (navigation is never "disabled": hide the link instead). */
    href: ComponentPropsWithRef<typeof Link>["href"];
    disabled?: never;
  };

export type ButtonProps = NativeButtonProps | LinkButtonProps;

/**
 * Button (design-system.md §12.2). Radius 10, `text-button`, A1 press.
 *
 * - `primary`: ink fill. `secondary`: surface with a 1.5px `line-strong` border. `quiet`:
 *   transparent ink text, underlined on hover. `aski`: the "Askıdan al" fill, askı only.
 *   `danger-quiet`: "İptal et", "Çıkış yap".
 * - Disabled: `ink-2` on `surface-2`, no border, never opacity — and give a `disabledReason`.
 * - `href` renders a `Link` with the same look.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    loadingLabel,
    iconStart,
    iconEnd,
    fullWidth = false,
    disabledReason,
    children,
    className,
    ...rest
  } = props;
  const reasonId = useId();

  const content = (
    <>
      {loading ? (
        // The one spinner the system allows (§7.1). Under reduced motion it stands still.
        <LoaderCircle aria-hidden size={20} strokeWidth={1.75} className="size-5 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : (
        iconStart != null && <Icon icon={iconStart} size={20} />
      )}
      <span className="min-w-0">{loading ? (loadingLabel ?? cartCopy.sending) : children}</span>
      {!loading && iconEnd != null && <Icon icon={iconEnd} size={20} />}
    </>
  );

  if (rest.href != null) {
    const { href, ...linkRest } = rest as Omit<LinkButtonProps, keyof ButtonOwnProps>;
    return (
      <Link href={href} {...linkRest} className={cx(buttonClasses({ variant, size, fullWidth }), className)}>
        {content}
      </Link>
    );
  }

  const { disabled = false, onClick, type = "button", ...buttonRest } = rest as Omit<NativeButtonProps, keyof ButtonOwnProps>;
  const withReason = disabled && disabledReason != null && disabledReason !== false;
  // A reason or a request in flight keeps the button focusable; clicks are swallowed instead.
  const soft = withReason || loading;
  const swallow = (event: MouseEvent<HTMLButtonElement>) => {
    if (soft && (disabled || loading)) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const button = (
    <button
      type={type}
      {...buttonRest}
      disabled={disabled && !soft}
      aria-disabled={(disabled || loading) && soft ? true : undefined}
      aria-busy={loading || undefined}
      aria-describedby={cx(buttonRest["aria-describedby"], withReason && reasonId) || undefined}
      onClick={swallow}
      className={cx(buttonClasses({ variant, size, fullWidth, disabled, loading }), !withReason && className)}
    >
      {content}
    </button>
  );

  if (!withReason) return button;
  return (
    <span className={cx("inline-flex flex-col gap-1.5", fullWidth ? "w-full items-stretch" : "items-start", className)}>
      {button}
      <span id={reasonId} className="text-meta text-ink-2">
        {disabledReason}
      </span>
    </span>
  );
}
