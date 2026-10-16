import type { ComponentPropsWithRef, MouseEvent, ReactNode } from "react";
import type Link from "next/link";
import { Button } from "./button";
import { cx } from "./cx";
import { Icon, type IconProp } from "./icon";

export interface EmptyStateAction {
  label: string;
  href?: ComponentPropsWithRef<typeof Link>["href"];
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

export interface EmptyStateProps {
  /** lucide icon (drawn 32px at stroke 1.5, `ink-2`). Pass an element from a Server Component. */
  icon: IconProp;
  /** One sentence ("Henüz siparişin yok. Bir kafe seç, ilk siparişini ver."). */
  text: ReactNode;
  /** At most one secondary button ("Kafelere bak"). */
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Empty state (design-system.md §12.2): a 64px `surface-2` disc with the icon, one sentence and
 * at most one secondary button. Centred, calm, no illustration.
 */
export function EmptyState({ icon, text, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-4 px-4 py-10 text-center", className)}>
      <span aria-hidden className="grid size-16 place-items-center rounded-full bg-surface-2 text-ink-2">
        <Icon icon={icon} size={32} />
      </span>
      <p className="max-w-[34ch] text-body-lg text-ink">{text}</p>
      {action &&
        (action.href != null ? (
          <Button variant="secondary" href={action.href}>
            {action.label}
          </Button>
        ) : (
          <Button variant="secondary" onClick={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  );
}
