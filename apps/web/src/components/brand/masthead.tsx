import { dateline, SEP } from "@peni/brand/format";
import { cx } from "./_cx";

/**
 * Manşet, the café masthead (design-system.md §6.4), in this order:
 * Oxford rule · 12px · café name (`text-h1`) · 8px · ink rule · 6px · dateline
 * "MODA KAHVESİ GAZETESİ · 16 EKİM 2026 · KADIKÖY" (`plate`, `ink-2`) · optional greeting
 * "Günaydın Ayşe." (`body`, `ink-2`).
 *
 * `compact` (top of Masa): no Oxford rule and no name; the ink rule and the dateline
 * "MODA KAHVESİ GAZETESİ · 16 EKİM 2026" only. The Oxford rule appears ONLY here and at the
 * head of a fiş.
 */
export function Masthead({
  cafe,
  date,
  greeting,
  compact = false,
  headingLevel = 1,
  className,
}: {
  cafe: { name: string; district?: string | null };
  /** The paper's date: today, in Istanbul. */
  date: Date | string;
  /** The full sentence, e.g. `${greeting(now)} ${firstName}.` */
  greeting?: string | null;
  compact?: boolean;
  /** The café name is the page's h1 on the café page. */
  headingLevel?: 1 | 2;
  className?: string;
}) {
  // It breaks only between segments ("16 EKİM 2026" never splits; the name may, when it must),
  // and the dot stays with the segment before it, so a wrapped line never starts with "·".
  const line = dateline(cafe, date, { compact })
    .split(SEP)
    .map((segment, i, all) => (
      <span key={i} className={i > 0 ? "whitespace-nowrap" : undefined}>
        {segment}
        {i < all.length - 1 ? "\u00A0·" : null}
        {i < all.length - 1 ? " " : null}
      </span>
    ));
  if (compact) {
    return (
      <div className={cx("flex flex-col", className)}>
        <div aria-hidden className="rule-ink" />
        <p className="plate mt-1.5 text-plate text-ink-2">{line}</p>
      </div>
    );
  }
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className={cx("flex flex-col", className)}>
      <div aria-hidden className="rule-oxford" />
      <Heading className="mt-3 font-display text-h1 text-ink">{cafe.name}</Heading>
      <div aria-hidden className="rule-ink mt-2" />
      <p className="plate mt-1.5 text-plate text-ink-2">{line}</p>
      {greeting && <p className="mt-2 text-body text-ink-2">{greeting}</p>}
    </div>
  );
}
