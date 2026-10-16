import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconProp } from "./icon";

export type BannerTone = "warning" | "danger" | "info" | "aski";

const TONE: Record<BannerTone, { box: string; icon: string; fallback: IconProp }> = {
  warning: { box: "bg-warning-soft", icon: "text-warning-ink", fallback: CircleAlert },
  danger: { box: "bg-danger-soft", icon: "text-danger", fallback: CircleAlert },
  info: { box: "bg-surface-2", icon: "text-ink-2", fallback: Info },
  aski: { box: "bg-aski-soft", icon: "text-aski-ink", fallback: Info },
};

export interface BannerProps {
  tone: BannerTone;
  /**
   * The spec's icon for the case: `CirclePause` for a paused café, `VolumeX` for sound off.
   * Ignored for `danger`, which is always `CircleAlert` (D1). Pass an element from a Server Component.
   */
  icon?: IconProp;
  /** The one sentence ("Kafeler yüklenemedi."). */
  title: ReactNode;
  /** Optional second line, `text-meta ink-2`. */
  children?: ReactNode;
  /** One small button ("Tekrar dene", "Şimdi aç", "Sesi aç"), e.g. `<Button size="sm" variant="secondary">`. */
  action?: ReactNode;
  className?: string;
}

/**
 * Banner (design-system.md §12.2): radius 10, padding 12, a flat soft fill, icon + words —
 * status is never colour alone. `role="status"`, or `role="alert"` for danger. The action
 * sits at the right and drops under the text when the line runs out of room.
 */
export function Banner({ tone, icon, title, children, action, className }: BannerProps) {
  const t = TONE[tone];
  const glyph = tone === "danger" ? CircleAlert : (icon ?? t.fallback);
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] p-3 text-ink", t.box, className)}
    >
      {/* Basis `auto`: a short sentence keeps its action on the same line; a long one takes the
          line and the action drops under it, right-aligned. */}
      <div className="flex min-w-0 flex-auto items-start gap-3">
        <Icon icon={glyph} size={20} className={cx("mt-px", t.icon)} />
        <div className="min-w-0 flex-1">
          <p className={cx("text-body", children != null && "font-semibold")}>{title}</p>
          {children != null && <div className="mt-0.5 text-meta text-ink-2">{children}</div>}
        </div>
      </div>
      {action != null && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
