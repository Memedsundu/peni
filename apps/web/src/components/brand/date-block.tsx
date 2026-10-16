import { dateBlock, TIME_ZONE } from "@peni/brand/format";
import { cx } from "./_cx";

const spoken = new Intl.DateTimeFormat("tr-TR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/**
 * Date block (design-system.md §6.5), a vişne plate for Peni masası dates:
 * "PER" · "22" · "EKİ". md 56×64, sm 40×48, radius 4. The time never goes inside it; put
 * "19:00" beside it in `text-item tabular-nums`.
 *
 * The plate is read as one date ("22 Ekim Perşembe"), not as three abbreviations.
 */
export function DateBlock({ date, size = "md", className }: { date: Date | string; size?: "md" | "sm"; className?: string }) {
  const d = dateBlock(date);
  const md = size === "md";
  return (
    <span
      className={cx(
        "inline-grid shrink-0 place-content-center justify-items-center rounded-[4px] bg-masa text-on-masa",
        md ? "h-16 w-14 gap-0.5" : "h-12 w-10",
        className,
      )}
    >
      <span aria-hidden className="plate text-plate leading-[13px]">
        {d.weekday}
      </span>
      <span
        aria-hidden
        className={cx(
          "font-display font-semibold lining-nums tabular-nums",
          md ? "text-[26px] leading-[26px]" : "text-[18px] leading-[19px]",
        )}
      >
        {d.day}
      </span>
      <span aria-hidden className="plate text-plate leading-[13px]">
        {d.month}
      </span>
      <span className="sr-only">{spoken.format(new Date(date))}</span>
    </span>
  );
}
